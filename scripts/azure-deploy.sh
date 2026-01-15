#!/bin/bash
# Deploy Subscription Dashboard to Azure Container Apps
# Usage: ./scripts/azure-deploy.sh [build-only]

set -e

# Configuration - Update these for your deployment
RESOURCE_GROUP="rg-subscription-dashboard"
LOCATION="westus"
ENVIRONMENT="cae-subscription-dashboard"
APP_NAME="ca-subscription-dashboard"
IMAGE_NAME="subscription-dashboard"

# Existing ACR configuration (using sefenergy ACR)
ACR_NAME="sefenergy"
ACR_SERVER="sefenergy.azurecr.io"
ACR_USERNAME="sefenergy"

echo "=== Azure Container Apps Deployment ==="
echo "Resource Group: $RESOURCE_GROUP"
echo "Location: $LOCATION"
echo "ACR: $ACR_SERVER"
echo "App: $APP_NAME"
echo ""

# Check if logged in to Azure
if ! az account show &>/dev/null; then
    echo "Not logged in to Azure. Running 'az login'..."
    az login
fi

# Login to ACR
echo "Logging in to ACR..."
az acr login --name "$ACR_NAME"

# Load environment variables from .env.local for build args
if [ -f ".env.local" ]; then
    echo "Loading build variables from .env.local..."
    export $(grep -v '^#' .env.local | grep -v '^$' | xargs)
fi

# Check required build args
if [ -z "$NEXT_PUBLIC_SUPABASE_URL" ]; then
    echo "ERROR: NEXT_PUBLIC_SUPABASE_URL is required for build"
    echo "Set it in .env.local or as an environment variable"
    exit 1
fi
if [ -z "$NEXT_PUBLIC_SUPABASE_ANON_KEY" ]; then
    echo "ERROR: NEXT_PUBLIC_SUPABASE_ANON_KEY is required for build"
    echo "Set it in .env.local or as an environment variable"
    exit 1
fi

# Get git commit hash for version footer
GIT_COMMIT=$(git rev-parse --short HEAD 2>/dev/null || echo "unknown")
echo "Git commit: $GIT_COMMIT"

# CalVer versioning (YYYY.MM.DD or YYYY.MM.DD.N for multiple deploys/day)
TODAY=$(date +%Y.%m.%d)
echo "Checking for existing deployments today..."

# Check how many tags exist for today
EXISTING_TAGS=$(az acr repository show-tags --name "$ACR_NAME" --repository "$IMAGE_NAME" --query "[?starts_with(@, '$TODAY')]" -o tsv 2>/dev/null | wc -l | tr -d ' ')

if [ "$EXISTING_TAGS" -eq "0" ]; then
    VERSION="$TODAY"
else
    VERSION="$TODAY.$((EXISTING_TAGS + 1))"
fi
echo "Version: $VERSION"

# Build and push image with both :latest and :version tags
# Pass NEXT_PUBLIC_* as build args (required at build time for Next.js)
echo ""
echo "Building and pushing image to ACR..."
az acr build --registry "$ACR_NAME" \
    --image "$IMAGE_NAME:latest" \
    --image "$IMAGE_NAME:$VERSION" \
    --build-arg "NEXT_PUBLIC_SUPABASE_URL=$NEXT_PUBLIC_SUPABASE_URL" \
    --build-arg "NEXT_PUBLIC_SUPABASE_ANON_KEY=$NEXT_PUBLIC_SUPABASE_ANON_KEY" \
    --build-arg "NEXT_PUBLIC_GIT_COMMIT=$GIT_COMMIT" \
    .

if [ "$1" = "build-only" ]; then
    echo "Build complete. Skipping deployment."
    exit 0
fi

# Get ACR password (or use environment variable)
if [ -z "$ACR_PASSWORD" ]; then
    echo ""
    echo "ACR_PASSWORD not set. Fetching from Azure..."
    ACR_PASSWORD=$(az acr credential show --name "$ACR_NAME" --query "passwords[0].value" -o tsv)
fi

# Check if resource group exists, create if needed
if ! az group show --name "$RESOURCE_GROUP" &>/dev/null; then
    echo "Creating resource group..."
    az group create --name "$RESOURCE_GROUP" --location "$LOCATION"
fi

# Check if Container Apps environment exists, create if needed
if ! az containerapp env show --name "$ENVIRONMENT" --resource-group "$RESOURCE_GROUP" &>/dev/null; then
    echo "Creating Container Apps environment..."
    az containerapp env create \
        --name "$ENVIRONMENT" \
        --resource-group "$RESOURCE_GROUP" \
        --location "$LOCATION"
fi

# Check if app exists
if az containerapp show --name "$APP_NAME" --resource-group "$RESOURCE_GROUP" &>/dev/null; then
    echo "Updating existing container app..."
    # Use versioned tag to force new revision (not :latest which can be cached)
    az containerapp update \
        --name "$APP_NAME" \
        --resource-group "$RESOURCE_GROUP" \
        --image "$ACR_SERVER/$IMAGE_NAME:$VERSION"
else
    echo "Creating new container app..."

    az containerapp create \
        --name "$APP_NAME" \
        --resource-group "$RESOURCE_GROUP" \
        --environment "$ENVIRONMENT" \
        --image "$ACR_SERVER/$IMAGE_NAME:$VERSION" \
        --target-port 3000 \
        --ingress external \
        --registry-server "$ACR_SERVER" \
        --registry-username "$ACR_USERNAME" \
        --registry-password "$ACR_PASSWORD" \
        --cpu 0.5 \
        --memory 1.0Gi \
        --min-replicas 0 \
        --max-replicas 3
fi

# Get the app URL for NEXT_PUBLIC_APP_URL
APP_URL=$(az containerapp show --name "$APP_NAME" --resource-group "$RESOURCE_GROUP" --query "properties.configuration.ingress.fqdn" -o tsv)

# Set secrets first (must exist before being referenced)
echo ""
echo "Setting secrets..."
az containerapp secret set \
    --name "$APP_NAME" \
    --resource-group "$RESOURCE_GROUP" \
    --secrets \
        "supabase-service-role-key=$SUPABASE_SERVICE_ROLE_KEY" \
        "openrouter-api-key=$OPENROUTER_API_KEY"

# Update environment variables referencing the secrets
echo "Updating environment variables..."
az containerapp update \
    --name "$APP_NAME" \
    --resource-group "$RESOURCE_GROUP" \
    --set-env-vars \
        "SUPABASE_SERVICE_ROLE_KEY=secretref:supabase-service-role-key" \
        "OPENROUTER_API_KEY=secretref:openrouter-api-key" \
        "NEXT_PUBLIC_APP_URL=https://$APP_URL"

# Rebuild with correct APP_URL now that we know it
echo ""
echo "Rebuilding with correct NEXT_PUBLIC_APP_URL..."
az acr build --registry "$ACR_NAME" \
    --image "$IMAGE_NAME:latest" \
    --image "$IMAGE_NAME:$VERSION" \
    --build-arg "NEXT_PUBLIC_SUPABASE_URL=$NEXT_PUBLIC_SUPABASE_URL" \
    --build-arg "NEXT_PUBLIC_SUPABASE_ANON_KEY=$NEXT_PUBLIC_SUPABASE_ANON_KEY" \
    --build-arg "NEXT_PUBLIC_APP_URL=https://$APP_URL" \
    --build-arg "NEXT_PUBLIC_GIT_COMMIT=$GIT_COMMIT" \
    .

# Update to the new image
az containerapp update \
    --name "$APP_NAME" \
    --resource-group "$RESOURCE_GROUP" \
    --image "$ACR_SERVER/$IMAGE_NAME:$VERSION"

# Output summary
echo ""
echo "=== Deployment Complete ==="
echo "App URL: https://$APP_URL"
echo "Version: $VERSION"
echo ""
echo "Environment variables configured:"
echo "  - NEXT_PUBLIC_SUPABASE_URL (build-time)"
echo "  - NEXT_PUBLIC_SUPABASE_ANON_KEY (build-time)"
echo "  - NEXT_PUBLIC_APP_URL (build-time)"
echo "  - SUPABASE_SERVICE_ROLE_KEY (secret)"
echo "  - OPENROUTER_API_KEY (secret)"
echo ""
echo "To rollback: az containerapp update --name $APP_NAME --resource-group $RESOURCE_GROUP --image $ACR_SERVER/$IMAGE_NAME:<version>"
echo "To view logs: az containerapp logs show --name $APP_NAME --resource-group $RESOURCE_GROUP --follow"

// ─── Vendor Mapping & Matching ──────────────────────────────────────────────

// SAP Business Partner -> Supabase vendor name
export const BP_TO_SUPABASE: Record<string, string> = {
  'WINTERWINDS ROBOTICS INC': 'WINTERWINDS ROBOTICS INC',
  'EQUIPT INNOVATION INC': 'EQUIPT INNOVATION INC',
  'NAVIGATOR BUSINESS SOLUTIONS  INC': 'NAVIGATOR BUSINESS SOLUTIONS  INC',
  'CDW LLC CDW DIRECT LLC': 'CDW LLC CDW DIRECT LLC',
  'N-ABLE TECHNOLOGIES LTD SOLARWINDS MSP HOLDINGS WORLDWIDE LTD': 'N-ABLE TECHNOLOGIES LTD SOLARWINDS MSP HOLDINGS WORLDWIDE LT',
  'PINNACLE BUSINESS SYSTEMS INC': 'Pinnacle Business Systems',
  'SYNERGY DATACOM SUPPLY INC': 'SYNERGY DATACOM SUPPLY INC',
  'TULSACONNECT INTERNET SERVICES': 'TULSACONNECT INTERNET SERVICES',
  'VIVIOTA  INC': 'VIVIOTA  INC',
  'STANDLEY SYSTEMS  LLC': 'STANDLEY SYSTEMS  LLC',
  'NEXTGEN SOFTWARE  INC': 'NEXTGEN SOFTWARE  INC',
  'MCE CONNECTRONICS LLC CONNECTRONICS': 'MCE CONNECTRONICS LLC CONNECTRONICS',
  'RYKDEN TECHNOLOGY SOLUTIONS': 'RYKDEN TECHNOLOGY SOLUTIONS',
  'PORT53 TECHNOLOGIES  INC': 'PORT53 TECHNOLOGIES  INC',
  'VENTI EXCHANGE LLC': 'Venti Exchange',
  'AZENDENT PARTNERS LLC TEAM VENTI': 'Venti Exchange',
};

// SB- credit card description patterns -> Supabase vendor
// Maps the vendor part after "SB-MMDD-" to Supabase vendor
export const SB_VENDOR_PATTERNS: [RegExp, string][] = [
  [/^AMAZON WEB SERVICES/i, 'Amazon Web Services'],
  [/^ADOBE/i, 'Adobe'],
  [/^Adobe/i, 'Adobe'],
  [/^GOOGLE\s*\*?\s*CLOUD/i, 'Google Cloud'],
  [/^GOOGLE CLOUD/i, 'Google Cloud'],
  [/^STARLINK/i, 'Starlink'],
  [/^GOTOCOM\*LOGMEIN/i, 'LogMeIn'],
  [/^GOTO LOGMEIN/i, 'LogMeIn'],
  [/^LogMeIn/i, 'LogMeIn'],
  [/^DROPBOX/i, 'Dropbox'],
  [/^DNH\*GODADDY/i, 'GoDaddy'],
  [/^GoDaddy/i, 'GoDaddy'],
  [/^OPENAI/i, 'OpenAI'],
  [/^RINGCENTRAL/i, 'RingCentral'],
  [/^SHOUTEM/i, 'Shoutem.com'],
  [/^Shoutem/i, 'Shoutem.com'],
  [/^YODECK/i, 'Yodeck.com'],
  [/^FS \*TECHSMITH/i, 'Techsmith'],
  [/^FRESHWORKS/i, 'Freshworks Inc'],
  [/^Freshworks/i, 'Freshworks Inc'],
  [/^GOOGLE \*YOUTUBE/i, 'YouTube'],
  [/^GOOGLE YOUTUBE/i, 'YouTube'],
  [/^YouTube/i, 'YouTube'],
  [/^CLAUDE\.AI/i, 'Claude.ai Subscription'],
  [/^SUPABASE/i, 'Supabase'],
  [/^LASTPASS/i, 'LastPass'],
  [/^SNIPE-IT/i, 'Snipe It Grokability'],
  [/^LITERA/i, 'Litera Microsytems'],
  [/^ENVATO/i, 'Envato'],
  [/^LOVABLE/i, 'Lovable'],
  [/^Lovable/i, 'Lovable'],
  [/^PADDLE/i, 'Paddle'],
  [/^P\.SKOOL/i, 'Skool.com'],
  [/^PEPLINK/i, 'Peplink'],
  [/^PELICAN/i, 'Pelican Products Inc'],
  [/^BEST BUY/i, 'Best Buy'],
  [/^MYBESTBUY/i, 'Best Buy'],
  [/^THE HOME DEPOT/i, 'The Home Depot'],
  [/^OFFICE DEPOT/i, 'Office Depot'],
  [/^FEDEX/i, 'FedEx Office'],
  [/^MINDMUP/i, 'OpenAI'],  // Not a match but for tracking
  [/^Realvnc/i, 'Realvnc Limited'],
  // NI Connect is NOT National Instruments - it's a conference/event charge. Removed per Trey's review.
  [/^SP PLAUD/i, 'Plaud Ai'],
  [/^Amazon Web Services/i, 'Amazon Web Services'],
  [/^ANTHROPIC/i, 'Claude.ai Subscription'],
  [/^Telephone Expense/i, 'Other'],
  [/^Phone Allowance/i, 'Other'],
  [/^Phone \w+/i, 'Other'],
  [/^Internet \w+/i, 'Other'],
  [/^\d+ Monthly for Phone/i, 'Other'],
  [/^GOOGLE \*LINKEDIN/i, 'Other'],
  [/^CBI\*DRAFTSIGHT/i, 'Other'],
  [/^WWW\.TEAMVENTI\.COM/i, 'Venti Exchange'],
];

// "Not assigned" description patterns -> Supabase vendor (non-SB)
export const DESC_VENDOR_PATTERNS: [RegExp, string][] = [
  [/^SYNERGY DATACOM/i, 'SYNERGY DATACOM SUPPLY INC'],
  [/^Viviota/i, 'VIVIOTA  INC'],
  [/Pinnacle Business/i, 'Pinnacle Business Systems'],
  [/DWE Pinnacle/i, 'Pinnacle Business Systems'],
];

/**
 * Match SB- credit card vendor description to a Supabase vendor name.
 * @param descAfterPrefix - the vendor part after "SB-MMDD-"
 */
export function matchSBVendor(descAfterPrefix: string): string | null {
  for (const [pattern, vendor] of SB_VENDOR_PATTERNS) {
    if (pattern.test(descAfterPrefix)) {
      return vendor === 'Other' ? null : vendor;
    }
  }
  return null;
}

/**
 * Match "Not assigned" description against known vendor patterns.
 */
export function matchDescVendor(desc: string): string | null {
  for (const [pattern, vendor] of DESC_VENDOR_PATTERNS) {
    if (pattern.test(desc)) {
      return vendor;
    }
  }
  return null;
}

/**
 * VendorMatcher wraps vendor matching in a class to avoid shared mutable state
 * between concurrent API requests.
 */
export class VendorMatcher {
  private vendorNames: string[] = [];
  private normalizedCache = new Map<string, string>();

  /**
   * Build the matcher with a list of known vendor names.
   */
  build(names: string[]): void {
    this.vendorNames = [...names];
    this.normalizedCache.clear();
  }

  /**
   * Fuzzy match an SAP business partner name to a known vendor.
   * Uses the BP_TO_SUPABASE mapping first, then falls back to normalized comparison.
   */
  fuzzyMatch(sapName: string): string | null {
    // Direct mapping first
    if (BP_TO_SUPABASE[sapName]) {
      return BP_TO_SUPABASE[sapName];
    }

    // Normalize and compare
    const normalizedSap = this.normalize(sapName);
    for (const vendor of this.vendorNames) {
      if (this.normalize(vendor) === normalizedSap) {
        return vendor;
      }
    }
    return null;
  }

  /**
   * Match a credit card merchant name to a known vendor.
   */
  matchCCMerchant(merchantName: string): string | null {
    return matchSBVendor(merchantName);
  }

  /**
   * Match a description line to a known vendor.
   */
  matchDescVendor(desc: string): string | null {
    return matchDescVendor(desc);
  }

  private normalize(name: string): string {
    if (this.normalizedCache.has(name)) {
      return this.normalizedCache.get(name)!;
    }
    const normalized = name
      .toUpperCase()
      .replace(/[.,\s]+/g, ' ')
      .replace(/\b(INC|LLC|LTD|CORP|CO)\b/g, '')
      .trim();
    this.normalizedCache.set(name, normalized);
    return normalized;
  }
}

import { Client } from 'pg';
import fs from 'fs';
import path from 'path';
import dotenv from 'dotenv';

// Load .env.local if it exists
if (fs.existsSync('.env.local')) {
    dotenv.config({ path: '.env.local' });
} else {
    dotenv.config();
}

async function migrate() {
    console.log("Starting Migration to Phase 6 Schema...");

    if (!process.env.POSTGRES_URL) { // Or DATABASE_URL
        console.error("Error: POSTGRES_URL environment variable is not set.");
        process.exit(1);
    }

    const client = new Client({
        connectionString: process.env.POSTGRES_URL,
    });

    try {
        await client.connect();

        const sqlPath = path.resolve('phase6_new_schema.sql');
        const sql = fs.readFileSync(sqlPath, 'utf8');

        console.log("Executing SQL...");
        await client.query(sql);

        console.log("✅ Migration applied successfully.");

    } catch (err) {
        console.error("❌ Migration Failed:", err);
    } finally {
        await client.end();
    }
}

migrate();

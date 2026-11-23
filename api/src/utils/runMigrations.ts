// Database Migration Runner
// Automatically runs SQL migrations on server startup

import { DatabaseService } from '../services/databaseService';
import { logger } from './logger';
import fs from 'fs';
import path from 'path';

export async function runMigrations(): Promise<void> {
  const db = DatabaseService.getInstance();
  
  try {
    logger.info('🔄 Checking for database migrations...');
    
    // Create migrations table if it doesn't exist
    await db.query(`
      CREATE TABLE IF NOT EXISTS _schema_migrations (
        id SERIAL PRIMARY KEY,
        migration_name VARCHAR(255) UNIQUE NOT NULL,
        applied_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);
    
    // Get list of applied migrations
    const appliedMigrations = await db.all(
      'SELECT migration_name FROM _schema_migrations ORDER BY id'
    );
    const appliedSet = new Set(appliedMigrations.map((m: any) => m.migration_name));
    
    // Read migration files
    const migrationsDir = path.join(__dirname, '../migrations');
    
    if (!fs.existsSync(migrationsDir)) {
      logger.info('📁 No migrations directory found, skipping migrations');
      return;
    }

    // If database already ran legacy migrations (e.g. 000_initial_schema through 083),
    // mark the consolidated baseline and seed as already satisfied
    const hasLegacyMigrations = appliedSet.has('000_initial_schema') || appliedSet.has('083_forex_signature_trail');
    if (hasLegacyMigrations) {
      if (!appliedSet.has('001_baseline_schema')) {
        await db.query(
          'INSERT INTO _schema_migrations (migration_name) VALUES ($1) ON CONFLICT DO NOTHING',
          ['001_baseline_schema']
        );
        appliedSet.add('001_baseline_schema');
        logger.info('   ℹ️  Existing database detected: baseline schema marked as satisfied');
      }
      if (!appliedSet.has('002_seed_initial_data')) {
        await db.query(
          'INSERT INTO _schema_migrations (migration_name) VALUES ($1) ON CONFLICT DO NOTHING',
          ['002_seed_initial_data']
        );
        appliedSet.add('002_seed_initial_data');
        logger.info('   ℹ️  Existing database detected: seed data marked as satisfied');
      }
    }
    
    // Filter to .sql files and sort with natural numeric ordering (e.g. 001, 002, 010)
    const files = fs.readdirSync(migrationsDir)
      .filter(f => f.endsWith('.sql') && fs.statSync(path.join(migrationsDir, f)).isFile())
      .sort((a, b) => a.localeCompare(b, undefined, { numeric: true, sensitivity: 'base' }));
    
    if (files.length === 0) {
      logger.info('✅ No migration files found');
      return;
    }
    
    logger.info(`📋 Found ${files.length} migration file(s)`);
    
    let appliedCount = 0;
    
    for (const file of files) {
      const migrationName = file.replace('.sql', '');
      
      if (appliedSet.has(migrationName)) {
        logger.info(`   ⏭️  Skipping already applied: ${migrationName}`);
        continue;
      }
      
      logger.info(`   ▶️  Applying migration: ${migrationName}`);
      
      // Read and execute migration file
      const filePath = path.join(migrationsDir, file);
      const sql = fs.readFileSync(filePath, 'utf-8');
      
      // Execute migration in a transaction
      const client = await db.getClient();
      try {
        await client.query('BEGIN');
        
        // Execute the SQL (may contain multiple statements)
        await client.query(sql);
        
        // Record migration as applied
        await client.query(
          'INSERT INTO _schema_migrations (migration_name) VALUES ($1)',
          [migrationName]
        );
        
        await client.query('COMMIT');
        appliedCount++;
        
        logger.info(`   ✅ Applied: ${migrationName}`);
      } catch (error) {
        await client.query('ROLLBACK');
        logger.error(`   ❌ Failed to apply ${migrationName}:`, error);
        throw error;
      } finally {
        client.release();
      }
    }
    
    if (appliedCount > 0) {
      logger.info(`✅ Successfully applied ${appliedCount} migration(s)`);
    } else {
      logger.info('✅ All migrations up to date');
    }
    
  } catch (error) {
    logger.error('❌ Migration error:', error);
    throw error;
  }
}

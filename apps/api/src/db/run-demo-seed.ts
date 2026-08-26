import path from 'node:path';
import dotenv from 'dotenv';
import { seedSchoolAnalyticsDemo } from './demo-seed';

dotenv.config({ path: path.resolve(__dirname, '../../.env') });

seedSchoolAnalyticsDemo().catch((error: unknown) => {
  console.error('Demo seed failed:', error);
  process.exitCode = 1;
});

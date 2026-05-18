import 'dotenv/config';
import { parseEnv, type AppEnv } from './env.schema.js';

export const env: AppEnv = parseEnv(process.env);

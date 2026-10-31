import pkg from '../../package.json';

export const APP_NAME = 'MeetPulse';
// Single source of truth: package.json (kept in sync with Cargo.toml and tauri.conf.json at release time).
export const APP_VERSION: string = pkg.version;

export { db, type Database } from "./client";
export * from "./schema";
export * as schema from "./schema";
export {
  migratePersonalOrgs,
  qualifiesAsAutoPersonalOrg,
  type OrgForCheck,
} from "./migrate-personal-orgs";

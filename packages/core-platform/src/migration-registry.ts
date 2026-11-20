import type {Db} from "mongodb";
import {ensureCoreIndexes,ensureIdentitySelectionIndexes} from "./indexes.js";
import {runMigrations,type Migration} from "./migrate.js";
export const coreMigrations:Migration[]=[
 {id:"0001_core_indexes",description:"Create global identity and tenant-scoped platform indexes",up:ensureCoreIndexes},
 {id:"0002_identity_workspace_selection",description:"Create single-use MFA and workspace selection challenge indexes",up:ensureIdentitySelectionIndexes}
];
export function runCoreMigrations(db:Db):Promise<string[]>{return runMigrations(db,coreMigrations);}

import type {Db} from "mongodb";
import {ensureCoreIndexes} from "./indexes.js";
import {runMigrations,type Migration} from "./migrate.js";
export const coreMigrations:Migration[]=[
 {id:"0001_core_indexes",description:"Create global identity and tenant-scoped platform indexes",up:ensureCoreIndexes}
];
export function runCoreMigrations(db:Db):Promise<string[]>{return runMigrations(db,coreMigrations);}

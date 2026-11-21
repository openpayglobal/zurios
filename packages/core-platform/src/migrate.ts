import type {Db} from "mongodb";
export type Migration={id:string;description:string;up:(db:Db)=>Promise<void>};
type MigrationRecord={_id:string;description:string;status?:"running"|"applied"|"failed";startedAt?:Date;appliedAt?:Date;failedAt?:Date;error?:string};
export async function runMigrations(db:Db,migrations:Migration[]):Promise<string[]>{
 const ledger=db.collection<MigrationRecord>("schema_migrations"); // MongoDB creates the unique _id index automatically.
 const ids=migrations.map(m=>m.id);
 if(ids.some(id=>!/^\d{4,}_[a-z0-9_-]+$/.test(id))||new Set(ids).size!==ids.length)throw new Error("INVALID_OR_DUPLICATE_MIGRATION_ID");
 const applied:string[]=[];
 for(const migration of [...migrations].sort((a,b)=>a.id.localeCompare(b.id))){
  const existing=await ledger.findOne({_id:migration.id});
  if(existing){if(existing.status==="applied"||!existing.status)continue;throw new Error(existing.status==="running"?"MIGRATION_REQUIRES_RECOVERY":"MIGRATION_PREVIOUSLY_FAILED");}
  try{await ledger.insertOne({_id:migration.id,description:migration.description,status:"running",startedAt:new Date()});}
  catch(error){const raced=await ledger.findOne({_id:migration.id});if(raced?.status==="applied"||raced&&!raced.status)continue;throw new Error("MIGRATION_ALREADY_CLAIMED");}
  try{await migration.up(db);await ledger.updateOne({_id:migration.id,status:"running"},{$set:{status:"applied",appliedAt:new Date()},$unset:{error:""}});applied.push(migration.id);}
  catch(error){await ledger.updateOne({_id:migration.id,status:"running"},{$set:{status:"failed",failedAt:new Date(),error:error instanceof Error?error.message:"Unknown migration error"}});throw error;}
 }
 return applied;
}

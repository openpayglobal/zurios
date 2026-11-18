import type {Db} from "mongodb";
export type Migration={id:string;description:string;up:(db:Db)=>Promise<void>};
export async function runMigrations(db:Db,migrations:Migration[]):Promise<string[]>{
 const ledger=db.collection<{_id:string;description:string;appliedAt:Date}>("schema_migrations");
 await ledger.createIndex({_id:1},{unique:true});
 const applied:string[]=[];
 for(const migration of [...migrations].sort((a,b)=>a.id.localeCompare(b.id))){
  if(await ledger.findOne({_id:migration.id}))continue;
  await migration.up(db);
  await ledger.insertOne({_id:migration.id,description:migration.description,appliedAt:new Date()});
  applied.push(migration.id);
 }
 return applied;
}

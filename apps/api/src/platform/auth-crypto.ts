import {createCipheriv,createDecipheriv,createHash,createHmac,randomBytes,timingSafeEqual} from "node:crypto";
import argon2 from "argon2";
const PASSWORD_OPTIONS={type:argon2.argon2id,memoryCost:19_456,timeCost:3,parallelism:1};
export async function hashPassword(password:string):Promise<string>{
 if(password.length<12||password.length>128)throw new Error("PASSWORD_POLICY_VIOLATION");
 return argon2.hash(password,PASSWORD_OPTIONS);
}
export async function verifyPassword(password:string,hash:string):Promise<boolean>{
 try{return await argon2.verify(hash,password);}catch{return false;}
}
const alphabet="ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
export function base32Encode(bytes:Buffer):string{
 let bits=0,value=0,out="";
 for(const byte of bytes){value=(value<<8)|byte;bits+=8;while(bits>=5){out+=alphabet[(value>>>(bits-5))&31];bits-=5;}}
 if(bits>0)out+=alphabet[(value<<(5-bits))&31];
 return out;
}
export function base32Decode(input:string):Buffer{
 const normalized=input.toUpperCase().replace(/=+$/,"").replace(/\s/g,"");
 let bits=0,value=0;const out:number[]=[];
 for(const char of normalized){const index=alphabet.indexOf(char);if(index<0)throw new Error("INVALID_BASE32_SECRET");value=(value<<5)|index;bits+=5;if(bits>=8){out.push((value>>>(bits-8))&255);bits-=8;}}
 return Buffer.from(out);
}
export function generateTotpSecret():string{return base32Encode(randomBytes(20));}
export function totpCode(secret:string,step=Math.floor(Date.now()/30_000)):string{
 const counter=Buffer.alloc(8);counter.writeBigUInt64BE(BigInt(step));
 const digest=createHmac("sha1",base32Decode(secret)).update(counter).digest(),offset=digest[digest.length-1]!&15;
 const binary=((digest[offset]!&127)<<24)|((digest[offset+1]!&255)<<16)|((digest[offset+2]!&255)<<8)|(digest[offset+3]!&255);
 return String(binary%1_000_000).padStart(6,"0");
}
export function verifyTotpCode(secret:string,code:string,now=Date.now(),window=1):number|null{
 if(!/^\d{6}$/.test(code))return null;
 const current=Math.floor(now/30_000);
 for(let step=current-window;step<=current+window;step++){
  const expected=Buffer.from(totpCode(secret,step)),actual=Buffer.from(code);
  if(expected.length===actual.length&&timingSafeEqual(expected,actual))return step;
 }
 return null;
}
function encryptionKey(encoded:string):Buffer{const key=Buffer.from(encoded,"base64");if(key.length!==32)throw new Error("MFA_ENCRYPTION_KEY_MUST_BE_32_BYTES");return key;}
export function encryptMfaSecret(secret:string,keyBase64:string):string{
 const iv=randomBytes(12),cipher=createCipheriv("aes-256-gcm",encryptionKey(keyBase64),iv),encrypted=Buffer.concat([cipher.update(secret,"utf8"),cipher.final()]);
 return [iv.toString("base64url"),cipher.getAuthTag().toString("base64url"),encrypted.toString("base64url")].join(".");
}
export function decryptMfaSecret(value:string,keyBase64:string):string{
 const [iv,tag,ciphertext]=value.split(".");if(!iv||!tag||!ciphertext)throw new Error("INVALID_ENCRYPTED_MFA_SECRET");
 const decipher=createDecipheriv("aes-256-gcm",encryptionKey(keyBase64),Buffer.from(iv,"base64url"));decipher.setAuthTag(Buffer.from(tag,"base64url"));
 return Buffer.concat([decipher.update(Buffer.from(ciphertext,"base64url")),decipher.final()]).toString("utf8");
}
export function generateRecoveryCodes(count=10):string[]{return Array.from({length:count},()=>randomBytes(8).toString("hex").toUpperCase());}
export function hashRecoveryCode(code:string):string{return createHash("sha256").update(code.replace(/[-\s]/g,"").toUpperCase()).digest("hex");}
export function hashOpaqueToken(token:string):string{return createHash("sha256").update(token).digest("hex");}

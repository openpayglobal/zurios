import argon2 from "argon2";
import {SignJWT,jwtVerify} from "jose";
import {config} from "../config.js";
const secret=new TextEncoder().encode(config.JWT_SECRET);
export async function hashPassword(password:string):Promise<string>{
 if(password.length<12)throw new Error("Password must contain at least 12 characters");
 return argon2.hash(password,{type:argon2.argon2id});
}
export async function verifyPassword(hash:string,password:string):Promise<boolean>{return argon2.verify(hash,password);}
export async function issueAccessToken(subject:string,tenantId:string):Promise<string>{
 return new SignJWT({tenantId}).setProtectedHeader({alg:"HS256"}).setSubject(subject).setIssuer(config.JWT_ISSUER).setAudience(config.JWT_AUDIENCE).setIssuedAt().setExpirationTime(`${config.ACCESS_TOKEN_TTL_SECONDS}s`).sign(secret);
}
export async function verifyAccessToken(token:string){return jwtVerify(token,secret,{issuer:config.JWT_ISSUER,audience:config.JWT_AUDIENCE});}

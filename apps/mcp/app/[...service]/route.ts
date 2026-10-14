import { database, AuthError, limit } from "../../../../lib/auth.js";
import { issuer,resource,SCOPES,registerClient,beginAuthorization,exchangeToken,revokeToken } from "../../../../lib/mcp/oauth.js";
export const runtime="nodejs";
export const maxDuration=30;
async function handle(request:Request) {
  const path=new URL(request.url).pathname;
  const headers={"Cache-Control":"no-store","Access-Control-Allow-Origin":"*"};
  try {
    if(request.method==="GET"&&path==="/.well-known/oauth-protected-resource")return Response.json({resource:resource(),authorization_servers:[issuer()],scopes_supported:SCOPES,bearer_methods_supported:["header"]},{headers});
    if(request.method==="GET"&&path==="/.well-known/oauth-authorization-server")return Response.json({issuer:issuer(),authorization_endpoint:`${issuer()}/oauth/authorize`,token_endpoint:`${issuer()}/oauth/token`,registration_endpoint:`${issuer()}/oauth/register`,revocation_endpoint:`${issuer()}/oauth/revoke`,response_types_supported:["code"],grant_types_supported:["authorization_code","refresh_token"],code_challenge_methods_supported:["S256"],token_endpoint_auth_methods_supported:["none"],scopes_supported:SCOPES,authorization_response_iss_parameter_supported:true},{headers});
    const sql=database();
    await limit(sql,"mcp-oauth-ip",request.headers.get("x-vercel-forwarded-for") || "local",30);
    if(request.method==="GET"&&path==="/oauth/authorize"){
      const id=await beginAuthorization(sql,Object.fromEntries(new URL(request.url).searchParams));
      const site=new URL(process.env.TESTIFY_SITE_URL || "http://127.0.0.1:5174");
      if(site.protocol!=="https:"&&process.env.VERCEL)throw new AuthError("Testify site URL must use HTTPS.",503);
      site.searchParams.set("mcpAuthorize",id);return Response.redirect(site,302);
    }
    if(request.method!=="POST")return Response.json({error:"not_found"},{status:404,headers});
    const text=await request.text();if(text.length>8192)throw new AuthError("OAuth request too large.",413);
    const body=request.headers.get("content-type")?.includes("application/json")?JSON.parse(text):Object.fromEntries(new URLSearchParams(text));
    if(path==="/oauth/register")return Response.json(await registerClient(sql,body),{status:201,headers});
    if(path==="/oauth/token")return Response.json(await exchangeToken(sql,body),{headers});
    if(path==="/oauth/revoke"){await revokeToken(sql,body);return Response.json({}, {headers});}
    return Response.json({error:"not_found"},{status:404,headers});
  }catch(error:any){const status=error instanceof AuthError?error.status:400;return Response.json({error:path==="/oauth/token"?"invalid_grant":"invalid_request",error_description:error instanceof AuthError?error.message:"Invalid OAuth request."},{status,headers});}
}
export {handle as GET,handle as POST};
export function OPTIONS(){return new Response(null,{status:204,headers:{"Access-Control-Allow-Origin":"*","Access-Control-Allow-Methods":"GET,POST,OPTIONS","Access-Control-Allow-Headers":"Content-Type,Authorization"}});}

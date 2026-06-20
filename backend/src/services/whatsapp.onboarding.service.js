import axios from "axios";
import crypto from "crypto";
import prisma from "../lib/db.js";
import { encrypt, decrypt } from "../lib/wa-crypto.js";
import { getWaCredentials, invalidateWaCredentials } from "../lib/wa-cache.js";
import { whatsappService } from "./whatsapp.service.js";
import {
  createOnboardingState,
  hashOnboardingNonce,
  parseOnboardingState,
} from "./whatsapp.onboarding-state.js";

const GRAPH_VERSION = "v25.0";
const GRAPH_URL = `https://graph.facebook.com/${GRAPH_VERSION}`;
const SESSION_TTL_MS = 30 * 60 * 1000;
const COMPLETED_STATUSES = new Set(["CONNECTED", "CANCELLED", "EXPIRED"]);

function requiredEnv(name) {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`${name} is required`);
  return value;
}

function publicApiBase() {
  return requiredEnv("PUBLIC_API_URL").replace(/\/$/, "");
}

function appRedirectUri() {
  return process.env.WHATSAPP_ONBOARDING_APP_REDIRECT || "stock://whatsapp-onboarding";
}

function graphError(error) {
  const details = error.response?.data?.error;
  const wrapped = new Error(details?.message || error.message || "Meta request failed");
  wrapped.code = details?.code ? String(details.code) : "META_REQUEST_FAILED";
  wrapped.subcode = details?.error_subcode ? String(details.error_subcode) : null;
  return wrapped;
}

async function graphGet(path, accessToken, params = {}) {
  try {
    const response = await axios.get(`${GRAPH_URL}/${path}`, {
      params,
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    return response.data;
  } catch (error) {
    throw graphError(error);
  }
}

async function graphPost(path, accessToken, body = {}) {
  try {
    const response = await axios.post(`${GRAPH_URL}/${path}`, body, {
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
    });
    return response.data;
  } catch (error) {
    throw graphError(error);
  }
}

function serializeSession(session) {
  return {
    id: session.id,
    shopId: session.shopId,
    status: session.status,
    mode: session.mode,
    businessPortfolioId: session.businessPortfolioId,
    wabaId: session.wabaId,
    phoneNumberId: session.phoneNumberId,
    finishEvent: session.finishEvent,
    currentStep: session.currentStep,
    completedSteps: session.completedSteps || [],
    lastErrorCode: session.lastErrorCode,
    lastErrorMessage: session.lastErrorMessage,
    retryCount: session.retryCount,
    expiresAt: session.expiresAt,
    connectedAt: session.connectedAt,
    createdAt: session.createdAt,
    updatedAt: session.updatedAt,
  };
}

function safeJson(value) {
  return JSON.stringify(value).replace(/</g, "\\u003c");
}

function finishMode(event) {
  return event === "FINISH_WHATSAPP_BUSINESS_APP_ONBOARDING" ? "COEXISTENCE" : "CLOUD_API";
}

function statusForPhone(phone) {
  if (phone?.quality_rating === "GREEN") return "GREEN";
  if (phone?.quality_rating === "YELLOW") return "YELLOW";
  if (phone?.quality_rating === "RED") return "RED";
  return "UNKNOWN";
}

class WhatsAppOnboardingService {
  async createSession({ shopId, initiatedById, mode = "CLOUD_API" }) {
    requiredEnv("WHATSAPP_APP_ID");
    requiredEnv("WHATSAPP_APP_SECRET");
    const configId = requiredEnv("WHATSAPP_EMBEDDED_SIGNUP_CONFIG_ID");
    const expiresAt = new Date(Date.now() + SESSION_TTL_MS);
    const initial = await prisma.waOnboardingSession.create({
      data: {
        shopId,
        initiatedById,
        mode,
        configId,
        graphVersion: GRAPH_VERSION,
        stateNonceHash: "pending",
        expiresAt,
        completedSteps: [],
      },
    });
    const { state, nonceHash } = createOnboardingState(initial.id, expiresAt);
    const session = await prisma.waOnboardingSession.update({
      where: { id: initial.id },
      data: { stateNonceHash: nonceHash },
    });
    return {
      session: serializeSession(session),
      launchUrl: `${publicApiBase()}/whatsapp/onboarding/launch/${session.id}?state=${encodeURIComponent(state)}`,
      redirectUri: appRedirectUri(),
    };
  }

  async getOwnedSession(sessionId, shopId, userId) {
    const session = await prisma.waOnboardingSession.findFirst({
      where: { id: sessionId, shopId, initiatedById: userId },
    });
    if (!session) throw new Error("Onboarding session not found");
    if (session.expiresAt < new Date() && !COMPLETED_STATUSES.has(session.status)) {
      return prisma.waOnboardingSession.update({
        where: { id: session.id },
        data: { status: "EXPIRED" },
      });
    }
    return session;
  }

  async getPublicSession(sessionId, state) {
    const parsed = parseOnboardingState(state);
    if (parsed.sessionId !== sessionId) throw new Error("Onboarding state does not match session");
    const session = await prisma.waOnboardingSession.findUnique({ where: { id: sessionId } });
    if (!session || hashOnboardingNonce(parsed.nonce) !== session.stateNonceHash) throw new Error("Invalid onboarding session");
    if (session.expiresAt < new Date()) throw new Error("Onboarding session expired");
    return session;
  }

  renderLaunchPage(session, state) {
    const config = {
      appId: requiredEnv("WHATSAPP_APP_ID"),
      configId: session.configId,
      graphVersion: session.graphVersion,
      state,
      completeUrl: `${publicApiBase()}/whatsapp/onboarding/sessions/${session.id}/complete`,
      appRedirect: appRedirectUri(),
      coexistence: session.mode === "COEXISTENCE",
    };
    return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <title>Connect WhatsApp</title>
  <style>
    body{font-family:system-ui,sans-serif;margin:0;background:#f0f2f5;color:#111b21}
    main{max-width:520px;margin:0 auto;padding:40px 20px}
    section{background:#fff;border:1px solid #dfe3e5;border-radius:8px;padding:24px}
    h1{font-size:24px;margin:0 0 10px}p{color:#54656f;line-height:1.5}
    button{width:100%;height:48px;border:0;border-radius:6px;background:#1877f2;color:#fff;font-size:16px;font-weight:700}
    button:disabled{opacity:.55}.status{font-size:14px;margin-top:16px}
  </style>
</head>
<body>
<main><section>
  <h1>Connect WhatsApp</h1>
  <p>Continue with Meta to select your business portfolio, WhatsApp Business Account, and phone number.</p>
  <button id="launch" disabled>Loading Meta...</button>
  <p id="status" class="status"></p>
</section></main>
<script>const CONFIG=${safeJson(config)};let sessionInfo=null;</script>
<script async defer crossorigin="anonymous" src="https://connect.facebook.net/en_US/sdk.js"></script>
<script>
  const statusNode=document.getElementById('status');
  const button=document.getElementById('launch');
  const redirect=(status)=>location.href=CONFIG.appRedirect+'?sessionId=${session.id}&status='+encodeURIComponent(status);
  const complete=async(code,eventPayload)=>{
    statusNode.textContent='Finishing setup...';
    const response=await fetch(CONFIG.completeUrl,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({state:CONFIG.state,code,eventPayload})});
    const payload=await response.json().catch(()=>({}));
    if(!response.ok) throw new Error(payload.message||'Setup failed');
    redirect(payload.data?.status||'AUTHORIZED');
  };
  window.addEventListener('message',(event)=>{
    if(!event.origin.endsWith('facebook.com'))return;
    try{const data=typeof event.data==='string'?JSON.parse(event.data):event.data;if(data?.type==='WA_EMBEDDED_SIGNUP'){sessionInfo=data;}}catch{}
  });
  window.fbAsyncInit=()=>{
    FB.init({appId:CONFIG.appId,autoLogAppEvents:true,xfbml:true,version:CONFIG.graphVersion});
    button.disabled=false;button.textContent='Continue with Facebook';
  };
  button.addEventListener('click',()=>{
    button.disabled=true;
    const extras={setup:{},sessionInfoVersion:'3'};
    if(CONFIG.coexistence)extras.featureType='whatsapp_business_app_onboarding';
    FB.login(async(response)=>{
      try{
        if(response.authResponse?.code){await complete(response.authResponse.code,sessionInfo);return;}
        if(sessionInfo?.event==='CANCEL'){await complete(null,sessionInfo);return;}
        throw new Error('Meta authorization was cancelled');
      }catch(error){statusNode.textContent=error.message;button.disabled=false;}
    },{config_id:CONFIG.configId,response_type:'code',override_default_response_type:true,extras});
  });
</script>
</body>
</html>`;
  }

  async completePublicSession(sessionId, { state, code, eventPayload }) {
    const session = await this.getPublicSession(sessionId, state);
    if (session.status === "CONNECTED") return serializeSession(session);
    const event = eventPayload?.event;
    const eventData = eventPayload?.data || {};

    if (!code) {
      const cancelled = await prisma.waOnboardingSession.update({
        where: { id: session.id },
        data: {
          status: "CANCELLED",
          finishEvent: event || "CANCEL",
          currentStep: eventData.current_step,
          metaSessionId: eventData.session_id,
          lastErrorCode: eventData.error_code ? String(eventData.error_code) : null,
          lastErrorMessage: eventData.error_message || "Onboarding cancelled",
          sessionInfo: eventPayload || {},
          cancelledAt: new Date(),
        },
      });
      return serializeSession(cancelled);
    }

    if (!eventData.waba_id && !eventData.waba_ids?.length) {
      throw new Error("Meta session logging did not return a WABA ID");
    }
    const wabaId = eventData.waba_id || eventData.waba_ids[0];
    const phoneNumberId = eventData.phone_number_id || null;
    const appId = requiredEnv("WHATSAPP_APP_ID");
    const appSecret = requiredEnv("WHATSAPP_APP_SECRET");
    let tokenData;
    try {
      const response = await axios.get(`${GRAPH_URL}/oauth/access_token`, {
        params: { client_id: appId, client_secret: appSecret, code },
      });
      tokenData = response.data;
    } catch (error) {
      throw graphError(error);
    }

    const accessToken = tokenData.access_token;
    const debug = await graphGet("debug_token", `${appId}|${appSecret}`, {
      input_token: accessToken,
    });
    const tokenInfo = debug.data || {};
    if (!tokenInfo.is_valid || String(tokenInfo.app_id) !== String(appId)) {
      throw new Error("Meta returned an invalid business token");
    }
    const managementScope = tokenInfo.granular_scopes?.find(
      (scope) => scope.scope === "whatsapp_business_management",
    );
    if (
      Array.isArray(managementScope?.target_ids)
      && managementScope.target_ids.length
      && !managementScope.target_ids.includes(wabaId)
    ) {
      throw new Error("Selected WABA is not granted to this business token");
    }
    const expiresAt = tokenData.expires_in
      ? new Date(Date.now() + Number(tokenData.expires_in) * 1000)
      : tokenInfo.expires_at
        ? new Date(Number(tokenInfo.expires_at) * 1000)
        : null;
    const verifyToken = session.verifyToken || crypto.randomBytes(32).toString("hex");
    const authorized = await prisma.waOnboardingSession.update({
      where: { id: session.id },
      data: {
        status: "ASSETS_DISCOVERED",
        mode: finishMode(event),
        businessTokenEncrypted: encrypt(accessToken),
        tokenType: tokenData.token_type || "business",
        tokenExpiresAt: expiresAt,
        grantedScopes: tokenInfo.scopes || [],
        businessPortfolioId: eventData.business_id || tokenInfo.business_id || null,
        wabaId,
        phoneNumberId,
        finishEvent: event,
        metaSessionId: eventData.session_id,
        sessionInfo: eventPayload || {},
        verifyToken,
        completedSteps: ["AUTHORIZED", "ASSETS_DISCOVERED"],
        authorizedAt: new Date(),
        lastErrorCode: null,
        lastErrorMessage: null,
      },
    });
    return serializeSession(await this.continueSession(authorized.id));
  }

  async continueSession(sessionId) {
    let session = await prisma.waOnboardingSession.findUnique({ where: { id: sessionId } });
    if (!session) throw new Error("Onboarding session not found");
    if (session.status === "CONNECTED") return session;
    if (!session.businessTokenEncrypted || !session.wabaId) throw new Error("Onboarding authorization is incomplete");
    const accessToken = decrypt(session.businessTokenEncrypted);
    const steps = new Set(session.completedSteps || []);
    try {
      await prisma.waOnboardingSession.update({
        where: { id: session.id },
        data: { retryCount: { increment: 1 }, lastAttemptAt: new Date() },
      });

      if (!steps.has("APP_SUBSCRIBED")) {
        await graphPost(`${session.wabaId}/subscribed_apps`, accessToken, {
          override_callback_uri: `${publicApiBase()}/whatsapp/webhook`,
          verify_token: session.verifyToken,
        });
        steps.add("APP_SUBSCRIBED");
        session = await prisma.waOnboardingSession.update({
          where: { id: session.id },
          data: {
            status: "APP_SUBSCRIBED",
            subscribedAt: new Date(),
            completedSteps: [...steps],
          },
        });
      }

      if (session.finishEvent === "FINISH_ONLY_WABA" || !session.phoneNumberId) {
        return prisma.waOnboardingSession.update({
          where: { id: session.id },
          data: {
            status: "ACTION_REQUIRED",
            lastErrorCode: "PHONE_NUMBER_REQUIRED",
            lastErrorMessage: "Complete Embedded Signup again and select or add a phone number.",
          },
        });
      }

      const conflict = await prisma.waIntegration.findFirst({
        where: { phoneNumberId: session.phoneNumberId, shopId: { not: session.shopId } },
        select: { shopId: true },
      });
      if (conflict) throw new Error("This WhatsApp phone number is already connected to another shop");

      const phone = await graphGet(session.phoneNumberId, accessToken, {
        fields: "id,display_phone_number,verified_name,quality_rating,name_status,code_verification_status,platform_type,throughput,account_mode",
      });

      if (session.mode !== "COEXISTENCE" && !steps.has("NUMBER_REGISTERED")) {
        if (phone.code_verification_status && phone.code_verification_status !== "VERIFIED") {
          return prisma.waOnboardingSession.update({
            where: { id: session.id },
            data: {
              status: "ACTION_REQUIRED",
              lastErrorCode: "PHONE_NOT_VERIFIED",
              lastErrorMessage: "The phone number must be verified in Embedded Signup before registration.",
            },
          });
        }
        const pin = session.registrationPinEncrypted
          ? decrypt(session.registrationPinEncrypted)
          : String(crypto.randomInt(100000, 1000000));
        await graphPost(`${session.phoneNumberId}/register`, accessToken, {
          messaging_product: "whatsapp",
          pin,
        });
        steps.add("NUMBER_REGISTERED");
        session = await prisma.waOnboardingSession.update({
          where: { id: session.id },
          data: {
            status: "NUMBER_REGISTERED",
            registrationPinEncrypted: encrypt(pin),
            registeredAt: new Date(),
            completedSteps: [...steps],
          },
        });
      }

      const integration = await prisma.waIntegration.upsert({
        where: { shopId: session.shopId },
        create: {
          shopId: session.shopId,
          verifyToken: session.verifyToken,
          accessToken: encrypt(accessToken),
          appSecret: requiredEnv("WHATSAPP_APP_SECRET"),
          businessPortfolioId: session.businessPortfolioId,
          businessAccountId: session.wabaId,
          phoneNumberId: session.phoneNumberId,
          phoneNumber: phone.display_phone_number,
          businessName: phone.verified_name,
          status: "CONNECTED",
          qualityRating: statusForPhone(phone),
          displayNameStatus: phone.name_status,
          capabilities: {
            platformType: phone.platform_type,
            throughput: phone.throughput,
            accountMode: phone.account_mode,
          },
          tokenType: session.tokenType,
          tokenExpiresAt: session.tokenExpiresAt,
          grantedScopes: session.grantedScopes,
          tokenLastValidatedAt: new Date(),
          onboardingMode: session.mode,
          reauthorizationRequired: false,
          connectedAt: new Date(),
          disconnectedAt: null,
        },
        update: {
          verifyToken: session.verifyToken,
          accessToken: encrypt(accessToken),
          appSecret: requiredEnv("WHATSAPP_APP_SECRET"),
          businessPortfolioId: session.businessPortfolioId,
          businessAccountId: session.wabaId,
          phoneNumberId: session.phoneNumberId,
          phoneNumber: phone.display_phone_number,
          businessName: phone.verified_name,
          status: "CONNECTED",
          qualityRating: statusForPhone(phone),
          displayNameStatus: phone.name_status,
          capabilities: {
            platformType: phone.platform_type,
            throughput: phone.throughput,
            accountMode: phone.account_mode,
          },
          tokenType: session.tokenType,
          tokenExpiresAt: session.tokenExpiresAt,
          grantedScopes: session.grantedScopes,
          tokenLastValidatedAt: new Date(),
          onboardingMode: session.mode,
          reauthorizationRequired: false,
          connectedAt: new Date(),
          disconnectedAt: null,
        },
      });
      if (!integration.rsaPublicKey) await whatsappService.generateRsaKeyPair(session.shopId);
      await invalidateWaCredentials(session.shopId);
      await getWaCredentials(session.shopId);
      steps.add("CONNECTED");
      return prisma.waOnboardingSession.update({
        where: { id: session.id },
        data: {
          status: "CONNECTED",
          completedSteps: [...steps],
          connectedAt: new Date(),
          lastErrorCode: null,
          lastErrorMessage: null,
        },
      });
    } catch (error) {
      return prisma.waOnboardingSession.update({
        where: { id: session.id },
        data: {
          status: "FAILED",
          completedSteps: [...steps],
          lastErrorCode: error.code || "ONBOARDING_FAILED",
          lastErrorMessage: error.message,
        },
      });
    }
  }

  serialize(session) {
    return serializeSession(session);
  }
}

export const whatsappOnboardingService = new WhatsAppOnboardingService();

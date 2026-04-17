import axios from "axios";
import { logger } from "../../utils/logger";
import { getAdAccountId } from "./client";

// ── Meta Ads — Criação e gestão de campanhas ──────────────────
// Implementa o fluxo completo: Campaign → AdSet → AdCreative → Ad

const META_GRAPH_URL = "https://graph.facebook.com/v25.0";

function getToken(): string {
  const t = process.env.META_ACCESS_TOKEN;
  if (!t) throw new Error("META_ACCESS_TOKEN não configurado");
  return t;
}

function getPageId(): string {
  const p = process.env.META_PAGE_ID;
  if (!p) throw new Error("META_PAGE_ID não configurado");
  return p;
}

function getPixelId(): string {
  return process.env.META_PIXEL_ID || "1380166206444041";
}

// ── Tipos ────────────────────────────────────────────────────

export type CampanhaObjetivo = "OUTCOME_SALES" | "OUTCOME_TRAFFIC" | "OUTCOME_AWARENESS";
export type CampanhaCTA = "SHOP_NOW" | "LEARN_MORE" | "SIGN_UP" | "GET_OFFER";

export interface CriarCampanhaInput {
  nome: string;
  objetivo: CampanhaObjetivo;
  orcamentoDiario: number;       // em reais (ex: 30 = R$30/dia)
  dataInicio: string;            // "YYYY-MM-DD"
  dataFim?: string;              // opcional
  publicoIds?: string[];         // IDs de Custom Audiences
  urlDestino: string;            // URL de destino do anúncio
  imagemUrl: string;             // URL pública da imagem
  titulo: string;                // headline (máx 40 chars)
  texto: string;                 // texto principal do anúncio
  cta?: CampanhaCTA;
  idadeMin?: number;             // default: 18
  idadeMax?: number;             // default: 55
}

export interface CriarCampanhaResult {
  campanhaId: string;
  adsetId: string;
  creativeId: string;
  adId: string;
  nome: string;
  urlGerenciador: string;
}

// ── Helpers de mapeamento ─────────────────────────────────────

function objetivoParaOtimizacao(objetivo: CampanhaObjetivo): {
  optimization_goal: string;
  billing_event: string;
} {
  switch (objetivo) {
    case "OUTCOME_SALES":
      return { optimization_goal: "OFFSITE_CONVERSIONS", billing_event: "IMPRESSIONS" };
    case "OUTCOME_TRAFFIC":
      return { optimization_goal: "LINK_CLICKS", billing_event: "LINK_CLICKS" };
    case "OUTCOME_AWARENESS":
      return { optimization_goal: "REACH", billing_event: "IMPRESSIONS" };
  }
}

function objetivoLabel(objetivo: CampanhaObjetivo): string {
  switch (objetivo) {
    case "OUTCOME_SALES":     return "Vendas";
    case "OUTCOME_TRAFFIC":   return "Tráfego";
    case "OUTCOME_AWARENESS": return "Alcance";
  }
}

// ── Passo 1: Criar Campaign ────────────────────────────────────

async function criarCampaign(input: CriarCampanhaInput): Promise<string> {
  const accountId = getAdAccountId();
  const token = getToken();

  const { data } = await axios.post(
    `${META_GRAPH_URL}/${accountId}/campaigns`,
    {
      name: input.nome,
      objective: input.objetivo,
      status: "PAUSED",
      special_ad_categories: [],
      access_token: token,
    },
    { timeout: 15000 },
  );

  logger.info("Meta Campaigns: campaign criada", { id: data.id, nome: input.nome });
  return data.id as string;
}

// ── Passo 2: Criar AdSet ───────────────────────────────────────

async function criarAdSet(input: CriarCampanhaInput, campaignId: string): Promise<string> {
  const accountId = getAdAccountId();
  const token = getToken();
  const { optimization_goal, billing_event } = objetivoParaOtimizacao(input.objetivo);

  const targeting: Record<string, unknown> = {
    geo_locations: { countries: ["BR"] },
    age_min: input.idadeMin ?? 18,
    age_max: input.idadeMax ?? 55,
    genders: [2], // Público feminino — core da Bibelô
  };

  if (input.publicoIds && input.publicoIds.length > 0) {
    targeting.custom_audiences = input.publicoIds.map((id) => ({ id }));
  }

  // Pixel para objetivo de conversão
  const promoted_object =
    input.objetivo === "OUTCOME_SALES"
      ? { pixel_id: getPixelId(), custom_event_type: "PURCHASE" }
      : undefined;

  const body: Record<string, unknown> = {
    name: `${input.nome} — AdSet`,
    campaign_id: campaignId,
    daily_budget: Math.round(input.orcamentoDiario * 100), // centavos
    billing_event,
    optimization_goal,
    bid_strategy: "LOWEST_COST_WITHOUT_CAP",
    targeting,
    start_time: new Date(`${input.dataInicio}T09:00:00-03:00`).toISOString(),
    status: "PAUSED",
    access_token: token,
  };

  if (input.dataFim) {
    body.end_time = new Date(`${input.dataFim}T23:59:00-03:00`).toISOString();
  }
  if (promoted_object) {
    body.promoted_object = promoted_object;
  }

  const { data } = await axios.post(
    `${META_GRAPH_URL}/${accountId}/adsets`,
    body,
    { timeout: 15000 },
  );

  logger.info("Meta Campaigns: adset criado", { id: data.id, campaignId });
  return data.id as string;
}

// ── Passo 3: Criar AdCreative ──────────────────────────────────

async function criarAdCreative(input: CriarCampanhaInput): Promise<string> {
  const accountId = getAdAccountId();
  const token = getToken();
  const pageId = getPageId();
  const instagramId = process.env.META_INSTAGRAM_ID;

  const object_story_spec: Record<string, unknown> = {
    page_id: pageId,
    link_data: {
      link: input.urlDestino,
      message: input.texto,
      name: input.titulo,
      call_to_action: {
        type: input.cta ?? "SHOP_NOW",
        value: { link: input.urlDestino },
      },
      picture: input.imagemUrl,
    },
  };

  if (instagramId) {
    object_story_spec.instagram_user_id = instagramId;
  }

  const { data } = await axios.post(
    `${META_GRAPH_URL}/${accountId}/adcreatives`,
    {
      name: `${input.nome} — Creative`,
      object_story_spec,
      access_token: token,
    },
    { timeout: 15000 },
  );

  logger.info("Meta Campaigns: creative criado", { id: data.id });
  return data.id as string;
}

// ── Passo 4: Criar Ad ──────────────────────────────────────────

async function criarAd(
  input: CriarCampanhaInput,
  adsetId: string,
  creativeId: string,
): Promise<string> {
  const accountId = getAdAccountId();
  const token = getToken();

  const { data } = await axios.post(
    `${META_GRAPH_URL}/${accountId}/ads`,
    {
      name: `${input.nome} — Anúncio`,
      adset_id: adsetId,
      creative: { creative_id: creativeId },
      status: "PAUSED",
      access_token: token,
    },
    { timeout: 15000 },
  );

  logger.info("Meta Campaigns: ad criado", { id: data.id, adsetId });
  return data.id as string;
}

// ── API pública: fluxo completo ────────────────────────────────

export async function criarCampanhaCompleta(
  input: CriarCampanhaInput,
): Promise<CriarCampanhaResult> {
  const accountId = getAdAccountId().replace("act_", "");

  // Sequencial — cada passo depende do anterior
  const campanhaId = await criarCampaign(input);
  const adsetId = await criarAdSet(input, campanhaId);
  const creativeId = await criarAdCreative(input);
  const adId = await criarAd(input, adsetId, creativeId);

  return {
    campanhaId,
    adsetId,
    creativeId,
    adId,
    nome: input.nome,
    urlGerenciador: `https://www.facebook.com/adsmanager/manage/campaigns?act=${accountId}`,
  };
}

// ── Pausar / Ativar campanha ───────────────────────────────────

export async function atualizarStatusCampanha(
  campanhaId: string,
  status: "ACTIVE" | "PAUSED",
): Promise<void> {
  const token = getToken();

  await axios.post(
    `${META_GRAPH_URL}/${campanhaId}`,
    { status, access_token: token },
    { timeout: 10000 },
  );

  logger.info("Meta Campaigns: status atualizado", { campanhaId, status });
}

// ── Arquivar campanha ──────────────────────────────────────────

export async function arquivarCampanha(campanhaId: string): Promise<void> {
  const token = getToken();

  await axios.post(
    `${META_GRAPH_URL}/${campanhaId}`,
    { status: "DELETED", access_token: token },
    { timeout: 10000 },
  );

  logger.info("Meta Campaigns: campanha arquivada", { campanhaId });
}

export { objetivoLabel };

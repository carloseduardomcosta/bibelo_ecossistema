import axios from "axios";
import { query, queryOne } from "../../db";
import { logger } from "../../utils/logger";

// ── Tipos ─────────────────────────────────────────────────────

export interface GoogleReview {
  author_name: string;
  rating: number;
  text: string;
  time: number;
  relative_time_description: string;
  profile_photo_url: string;
}

export interface PlaceReviews {
  overall_rating: number;
  total_reviews: number;
  reviews: GoogleReview[];
  photos: string[];
}

// ── Tabela de cache ───────────────────────────────────────────

export async function ensureReviewsTable(): Promise<void> {
  await query(`
    CREATE TABLE IF NOT EXISTS marketing.google_reviews (
      id SERIAL PRIMARY KEY,
      author_name VARCHAR(200),
      rating INT NOT NULL,
      review_text TEXT,
      review_time BIGINT,
      relative_time VARCHAR(100),
      profile_photo_url TEXT,
      overall_rating NUMERIC(2,1),
      total_reviews INT,
      atualizado_em TIMESTAMPTZ DEFAULT NOW()
    )
  `);
}

// ── Buscar reviews da Google Places API ───────────────────────

export async function fetchGoogleReviews(): Promise<PlaceReviews | null> {
  const apiKey = process.env.GOOGLE_MAPS_API_KEY;
  const placeId = process.env.GOOGLE_PLACE_ID;

  if (!apiKey || !placeId) {
    logger.warn("Google Reviews: GOOGLE_MAPS_API_KEY ou GOOGLE_PLACE_ID não configurados");
    return null;
  }

  try {
    // Usa Places API (New) — já ativada no projeto Google Cloud
    const { data } = await axios.get(
      `https://places.googleapis.com/v1/places/${placeId}`,
      {
        headers: {
          "X-Goog-Api-Key": apiKey,
          "X-Goog-FieldMask": "rating,userRatingCount,reviews,photos",
        },
        params: { languageCode: "pt-BR" },
        timeout: 10000,
      }
    );

    // Resolve URLs de fotos — prioriza fotos de clientes (pula fotos do dono da loja)
    const allPhotos: Array<Record<string, unknown>> = data.photos || [];
    // Filtra: pula fotos do dono do estabelecimento
    const ownerKeywords = ["papelaria bibel", "papelaria bibelo", "bibelô", "bibelo"];
    const customerPhotos = allPhotos.filter((p: Record<string, unknown>) => {
      const authors = p.authorAttributions as Array<Record<string, string>> | undefined;
      if (!authors || authors.length === 0) return true; // sem autor = aceita
      const name = (authors[0]?.displayName || "").toLowerCase();
      return !ownerKeywords.some(kw => name.includes(kw));
    });
    // Usa fotos de clientes (até 10); se poucas, pula as 5 primeiras (logo/fachada/estoque)
    const selectedPhotos = customerPhotos.length >= 4 ? customerPhotos.slice(0, 10) : allPhotos.slice(5, 15);
    const photoNames: string[] = selectedPhotos.map((p: Record<string, unknown>) => p.name as string).filter(Boolean);
    const photoUrls: string[] = [];
    for (const name of photoNames) {
      try {
        const photoRes = await axios.get(`https://places.googleapis.com/v1/${name}/media`, {
          headers: { "X-Goog-Api-Key": apiKey },
          params: { maxWidthPx: 600 },
          maxRedirects: 0,
          validateStatus: (s: number) => s === 302 || s === 200,
        });
        if (photoRes.headers.location) photoUrls.push(photoRes.headers.location);
      } catch { /* skip photo */ }
    }

    return {
      overall_rating: data.rating || 0,
      total_reviews: data.userRatingCount || 0,
      reviews: (data.reviews || []).map((r: Record<string, unknown>) => {
        const author = r.authorAttribution as Record<string, string> | undefined;
        const textObj = r.text as Record<string, string> | undefined;
        const origText = r.originalText as Record<string, string> | undefined;
        return {
          author_name: author?.displayName || "Cliente",
          rating: (r.rating as number) || 5,
          text: origText?.text || textObj?.text || "",
          time: r.publishTime ? Math.floor(new Date(r.publishTime as string).getTime() / 1000) : 0,
          relative_time_description: r.relativePublishTimeDescription as string || "",
          profile_photo_url: author?.photoUri || "",
        };
      }),
      photos: photoUrls,
    };
  } catch (err) {
    logger.error("Falha ao buscar Google Reviews", { error: String(err) });
    return null;
  }
}

// ── Atualizar cache no banco ──────────────────────────────────

export async function refreshReviewsCache(): Promise<PlaceReviews | null> {
  const data = await fetchGoogleReviews();
  if (!data) return null;

  await ensureReviewsTable();

  // Limpa cache antigo e insere novos
  await query("DELETE FROM marketing.google_reviews");

  for (const r of data.reviews) {
    await query(
      `INSERT INTO marketing.google_reviews
       (author_name, rating, review_text, review_time, relative_time, profile_photo_url, overall_rating, total_reviews)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
      [r.author_name, r.rating, r.text, r.time, r.relative_time_description,
       r.profile_photo_url, data.overall_rating, data.total_reviews]
    );
  }

  // Salva fotos no primeiro registro (campo profile_photo_url como JSON das fotos do local)
  if (data.photos.length > 0 && data.reviews.length > 0) {
    await query(
      `UPDATE marketing.google_reviews SET profile_photo_url = $1 WHERE id = (SELECT MIN(id) FROM marketing.google_reviews)`,
      [JSON.stringify(data.photos)]
    );
  }

  logger.info("Google Reviews atualizados", {
    rating: data.overall_rating,
    total: data.total_reviews,
    reviews: data.reviews.length,
    photos: data.photos.length,
  });

  return data;
}

// ── Buscar reviews do cache ───────────────────────────────────

export async function getCachedReviews(): Promise<PlaceReviews> {
  await ensureReviewsTable();

  const rows = await query<{
    author_name: string; rating: number; review_text: string;
    review_time: number; relative_time: string; profile_photo_url: string;
    overall_rating: number; total_reviews: number;
  }>(
    "SELECT * FROM marketing.google_reviews ORDER BY review_time DESC LIMIT 10"
  );

  if (rows.length === 0) {
    // Sem cache — tenta buscar direto
    const fresh = await refreshReviewsCache();
    if (fresh) return fresh;

    // Fallback: reviews estáticas (para quando API não está configurada)
    return {
      overall_rating: 5.0,
      total_reviews: 0,
      reviews: [
        {
          author_name: "Cliente",
          rating: 5,
          text: "Amei tudo! Embalagem linda, produtos de qualidade. Com certeza vou comprar de novo!",
          time: 0,
          relative_time_description: "",
          profile_photo_url: "",
        },
        {
          author_name: "Cliente",
          rating: 5,
          text: "Entrega rápida e atendimento maravilhoso. A papelaria mais fofa que já vi!",
          time: 0,
          relative_time_description: "",
          profile_photo_url: "",
        },
      ],
      photos: [],
    };
  }

  // Busca fotos do local (salvas como JSON no primeiro registro)
  let photos: string[] = [];
  const first = await queryOne<{ profile_photo_url: string }>(
    "SELECT profile_photo_url FROM marketing.google_reviews ORDER BY id LIMIT 1"
  );
  if (first?.profile_photo_url?.startsWith("[")) {
    try { photos = JSON.parse(first.profile_photo_url); } catch { /* ignore */ }
  }

  return {
    overall_rating: rows[0].overall_rating,
    total_reviews: rows[0].total_reviews,
    reviews: rows.map(r => ({
      author_name: r.author_name,
      rating: r.rating,
      text: r.review_text,
      time: r.review_time,
      relative_time_description: r.relative_time,
      profile_photo_url: r.profile_photo_url,
    })),
    photos,
  };
}

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
    const { data } = await axios.get(
      "https://maps.googleapis.com/maps/api/place/details/json",
      {
        params: {
          place_id: placeId,
          fields: "rating,user_ratings_total,reviews",
          key: apiKey,
          language: "pt-BR",
          reviews_sort: "newest",
        },
        timeout: 10000,
      }
    );

    if (data.status !== "OK") {
      logger.error("Google Places API error", { status: data.status, error_message: data.error_message });
      return null;
    }

    const result = data.result;
    return {
      overall_rating: result.rating || 0,
      total_reviews: result.user_ratings_total || 0,
      reviews: (result.reviews || []).map((r: Record<string, unknown>) => ({
        author_name: r.author_name || "Cliente",
        rating: r.rating || 5,
        text: r.text || "",
        time: r.time || 0,
        relative_time_description: r.relative_time_description || "",
        profile_photo_url: r.profile_photo_url || "",
      })),
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

  logger.info("Google Reviews atualizados", {
    rating: data.overall_rating,
    total: data.total_reviews,
    reviews: data.reviews.length,
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
    "SELECT * FROM marketing.google_reviews ORDER BY review_time DESC LIMIT 5"
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
    };
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
  };
}

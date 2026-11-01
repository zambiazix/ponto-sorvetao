// src/utils/geoUtils.js

// 🎯 Localização da loja — AJUSTE COM SUAS COORDENADAS EXATAS
// (Abra o Google Maps, clique com botão direito no ponto exato → "Copiar coordenadas")
export const LOJA_LOCATION = {
  lat: -29.46129,  // ⚠️ ajuste
  lng: -51.96631,    // ⚠️ ajuste
  raioMetros: 50,
  endereco: "Julio de Castilhos, 935 - Centro, Lajeado/RS",
};

let _cache = null;
let _cacheAt = 0;
const CACHE_MS = 60_000; // 60s

export function calcularDistanciaM(lat1, lon1, lat2, lon2) {
  const R = 6371000;
  const toRad = (d) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

export async function obterLocalizacao({ forcar = false } = {}) {
  if (!forcar && _cache && Date.now() - _cacheAt < CACHE_MS) return _cache;
  if (!("geolocation" in navigator)) {
    throw new Error("Geolocalização não suportada neste dispositivo.");
  }
  return new Promise((resolve, reject) => {
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const p = {
          lat: pos.coords.latitude,
          lng: pos.coords.longitude,
          accuracy: pos.coords.accuracy,
        };
        _cache = p;
        _cacheAt = Date.now();
        resolve(p);
      },
      (err) => {
        const msgs = {
          1: "Permissão de localização negada. Habilite nas configurações do navegador.",
          2: "Localização indisponível. Verifique se o GPS está ligado.",
          3: "Tempo esgotado ao buscar localização.",
        };
        reject(new Error(msgs[err.code] || "Erro de localização."));
      },
      { enableHighAccuracy: true, timeout: 8000, maximumAge: 60_000 }
    );
  });
}

export async function estaDentroDaLoja({ forcar = false } = {}) {
  try {
    const pos = await obterLocalizacao({ forcar });
    const dist = calcularDistanciaM(
      pos.lat, pos.lng, LOJA_LOCATION.lat, LOJA_LOCATION.lng
    );
    return {
      ok: dist <= LOJA_LOCATION.raioMetros,
      distancia: Math.round(dist),
      precisao: Math.round(pos.accuracy || 0),
      endereco: LOJA_LOCATION.endereco,
      raio: LOJA_LOCATION.raioMetros,
    };
  } catch (err) {
    return { ok: false, erro: err.message };
  }
}

// Pré-aquecimento em background (chamado na home)
export function preAquecerLocalizacao() {
  if (!("geolocation" in navigator)) return;
  // Silencioso — só pra encher o cache
  navigator.geolocation.getCurrentPosition(
    (pos) => {
      _cache = {
        lat: pos.coords.latitude,
        lng: pos.coords.longitude,
        accuracy: pos.coords.accuracy,
      };
      _cacheAt = Date.now();
    },
    () => {}, // ignora erros silenciosamente
    { enableHighAccuracy: true, timeout: 5000, maximumAge: 120_000 }
  );
}
// =========================================================
// Flag: a loja exige GPS? (lê de lojas/{lojaId}.exigirGPS)
// =========================================================
import { doc, getDoc, updateDoc } from "firebase/firestore";
import { db } from "../services/firebase";

let _exigirGPSCache = null;
let _exigirGPSCacheAt = 0;
const CACHE_EXIGIR_MS = 3000; // 3s de cache

/**
 * Retorna true se a loja exige GPS. Default = true.
 * Cache curto pra evitar leituras repetidas.
 */
export async function getExigirGPS(lojaId, { forcar = false } = {}) {
  if (!lojaId) return true;
  if (!forcar && _exigirGPSCache !== null && Date.now() - _exigirGPSCacheAt < CACHE_EXIGIR_MS) {
    return _exigirGPSCache;
  }
  try {
    const snap = await getDoc(doc(db, "lojas", lojaId));
    const val = snap.exists() ? snap.data().exigirGPS !== false : true;
    _exigirGPSCache = val;
    _exigirGPSCacheAt = Date.now();
    return val;
  } catch (err) {
    console.warn("Erro ao ler exigirGPS:", err);
    return true;
  }
}

/** Salva a flag no Firestore e atualiza o cache local. */
export async function setExigirGPS(lojaId, valor) {
  const v = !!valor;
  await updateDoc(doc(db, "lojas", lojaId), { exigirGPS: v });
  _exigirGPSCache = v;
  _exigirGPSCacheAt = Date.now();
}

/** Invalida o cache (força releitura na próxima chamada). */
export function invalidarCacheExigirGPS() {
  _exigirGPSCache = null;
  _exigirGPSCacheAt = 0;
}
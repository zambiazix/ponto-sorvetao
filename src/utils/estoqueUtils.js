// src/utils/estoqueUtils.js
export function normalize(str) {
  if (!str) return "";
  return String(str)
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

export function matches(haystack, needle) {
  if (!needle) return true;
  return normalize(haystack).includes(normalize(needle));
}

export const fmtBRL = (v) =>
  Number(v || 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

export const fmtData = (iso) => {
  if (!iso) return "-";
  try {
    if (/^\d{4}-\d{2}-\d{2}$/.test(iso)) {
      const [y, m, d] = iso.split("-");
      return `${d}/${m}/${y}`;
    }
    const dt = new Date(iso);
    if (isNaN(dt.getTime())) return "-";
    return dt.toLocaleDateString("pt-BR");
  } catch {
    return "-";
  }
};

export const hojeISO = () => new Date().toISOString().slice(0, 10);
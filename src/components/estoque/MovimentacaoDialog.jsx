// src/components/estoque/MovimentacaoDialog.jsx
import { useEffect, useState } from "react";
import {
  Button, Dialog, DialogActions, DialogContent, DialogTitle,
  FormControl, FormHelperText, InputLabel, MenuItem, Select,
  Stack, TextField, Typography,
} from "@mui/material";
import { hojeISO } from "../../utils/estoqueUtils";

function NumField({ label, value, onChange, error, helperText, ...props }) {
  const handleChange = (e) => {
    const raw = e.target.value.replace(",", ".");
    if (raw === "") return onChange("");
    const n = Number(raw);
    if (!isNaN(n)) onChange(n);
  };
  return (
    <TextField
      label={label}
      value={value === "" || value == null ? "" : value}
      onChange={handleChange}
      type="text"
      inputProps={{ inputMode: "decimal" }}
      error={!!error}
      helperText={helperText || " "}
      fullWidth
      {...props}
    />
  );
}

const TIPOS = [
  { value: "entrada", label: "ENTRADA (chegou mercadoria)" },
  { value: "saida", label: "SAÍDA (usou / vendeu)" },
  { value: "ajuste", label: "AJUSTE (definir contagem exata)" },
];

export default function MovimentacaoDialog({ open, onClose, item, onConfirm }) {
  const [tipo, setTipo] = useState("entrada");
  const [quantidade, setQuantidade] = useState("");
  const [precoCompra, setPrecoCompra] = useState("");
  const [data, setData] = useState("");
  const [motivo, setMotivo] = useState("");
  const [erro, setErro] = useState("");

  useEffect(() => {
    if (open) {
      setTipo("entrada");
      setQuantidade("");
      setPrecoCompra(item?.precoCompra ?? "");
      setData(hojeISO());
      setMotivo("");
      setErro("");
    }
  }, [open, item]);

  if (!item) return null;

  const qtdNum = Number(quantidade) || 0;
  const projecao =
    tipo === "entrada" ? item.quantidadeAtual + qtdNum
    : tipo === "saida" ? Math.max(0, item.quantidadeAtual - qtdNum)
    : qtdNum;

  const handleConfirm = () => {
    // Validação clara: quantidade
    if (quantidade === "" || qtdNum <= 0) {
      setErro("Informe uma QUANTIDADE maior que zero.");
      return;
    }
    // Se for ENTRADA, exige preço (pode ser 0 se for doação, mas avisa)
    if (tipo === "entrada" && (precoCompra === "" || Number(precoCompra) < 0)) {
      setErro("Informe o PREÇO DE COMPRA (pode ser 0 se foi doação).");
      return;
    }
    if (tipo === "saida" && qtdNum > item.quantidadeAtual) {
      if (!window.confirm(
        `A saída (${qtdNum}) é maior que o estoque atual (${item.quantidadeAtual}). Continuar?`
      )) return;
    }
    setErro("");
    onConfirm({
      tipo,
      quantidade: qtdNum,
      precoCompra: tipo === "entrada" ? Number(precoCompra) || 0 : undefined,
      data: data || hojeISO(),
      motivo: motivo.trim(),
    });
  };

  const erroQuantidade =
    erro.toLowerCase().includes("quantidade");
  const erroPreco =
    erro.toLowerCase().includes("preço") || erro.toLowerCase().includes("preco");

  return (
    <Dialog open={open} onClose={onClose} fullWidth maxWidth="sm">
      <DialogTitle sx={{ textTransform: "uppercase", fontWeight: "bold" }}>
        MOVIMENTAR ESTOQUE
      </DialogTitle>
      <DialogContent>
        <Stack spacing={1} sx={{ mt: 1 }}>
          <Typography variant="body2" color="#bbb">
            <strong>{item.nome}</strong> — estoque atual:{" "}
            <strong>{item.quantidadeAtual} {item.unidade}</strong>
          </Typography>

          <FormControl fullWidth>
            <InputLabel id="tipo-mov-label">TIPO</InputLabel>
            <Select
              labelId="tipo-mov-label"
              value={tipo}
              label="TIPO"
              onChange={(e) => { setTipo(e.target.value); setErro(""); }}
            >
              {TIPOS.map((t) => (
                <MenuItem key={t.value} value={t.value}>{t.label}</MenuItem>
              ))}
            </Select>
          </FormControl>

          <NumField
            label="QUANTIDADE"
            value={quantidade}
            onChange={(v) => { setQuantidade(v); setErro(""); }}
            error={erroQuantidade}
            helperText={erroQuantidade ? erro : " "}
          />

          {tipo === "entrada" && (
            <NumField
              label="PREÇO DE COMPRA (R$)"
              value={precoCompra}
              onChange={(v) => { setPrecoCompra(v); setErro(""); }}
              error={erroPreco}
              helperText={erroPreco ? erro : "Ex: 11,50"}
            />
          )}

          <TextField
            label="DATA"
            type="date"
            value={data}
            onChange={(e) => setData(e.target.value)}
            fullWidth
            InputLabelProps={{ shrink: true }}
          />

          <TextField
            label="MOTIVO / OBSERVAÇÃO"
            value={motivo}
            onChange={(e) => setMotivo(e.target.value)}
            fullWidth
            multiline
            minRows={2}
            placeholder="Ex: Compra fornecedor X, uso interno..."
          />

          {qtdNum > 0 && (
            <Typography variant="caption" sx={{ color: "#4caf50", fontWeight: "bold" }}>
              Resultado após movimentação: {projecao} {item.unidade}
            </Typography>
          )}

          {erro && (
            <Typography variant="caption" sx={{ color: "#f44336", fontWeight: "bold" }}>
              ⚠️ {erro}
            </Typography>
          )}
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>CANCELAR</Button>
        <Button variant="contained" onClick={handleConfirm}>CONFIRMAR</Button>
      </DialogActions>
    </Dialog>
  );
}
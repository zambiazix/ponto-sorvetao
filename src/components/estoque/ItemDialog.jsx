// src/components/estoque/ItemDialog.jsx
import { useEffect, useState } from "react";
import {
  Button, Dialog, DialogActions, DialogContent, DialogTitle,
  FormControl, InputLabel, MenuItem, Select, Stack, TextField, Typography,
} from "@mui/material";
import ImagemUploadField from "./ImagemUploadField";

const EMPTY = {
  nome: "",
  codigo: "",
  descricao: "",
  unidade: "un",
  quantidadeAtual: 0,
  quantidadeMinima: 0,
  precoCompra: 0,
  dataCompra: "",
  fornecedorNome: "",
  fornecedorContato: "",
  imagemUrl: "",
};

const UNIDADES = ["un", "cx", "pct", "kg", "g", "L", "mL", "fd", "dz", "sc"];

function NumField({ label, value, onChange, ...props }) {
  const handleChange = (e) => {
    const raw = e.target.value.replace(",", ".");
    if (raw === "") return onChange("");
    const n = Number(raw);
    if (!isNaN(n)) onChange(n);
  };
  return (
    <TextField
      label={label}
      value={value === "" ? "" : value}
      onChange={handleChange}
      type="text"
      inputProps={{ inputMode: "decimal" }}
      fullWidth
      {...props}
    />
  );
}

export default function ItemDialog({ open, onClose, onSave, initial, onMovimentar }) {
  const [values, setValues] = useState(EMPTY);
  const isEdit = !!initial?.id;

  useEffect(() => {
    if (!open) return;
    if (initial) {
      setValues({
        ...EMPTY,
        ...initial,
        fornecedorNome: initial.fornecedor?.nome || initial.fornecedorNome || "",
        fornecedorContato: initial.fornecedor?.contato || initial.fornecedorContato || "",
        dataCompra: initial.dataCompra || "",
      });
    } else {
      setValues(EMPTY);
    }
  }, [open, initial]);

  const set = (k, v) => setValues((p) => ({ ...p, [k]: v }));

  const handleSave = () => {
    if (!values.nome.trim()) return alert("Informe o nome do produto.");
    onSave(
      {
        nome: values.nome.trim(),
        codigo: values.codigo.trim(),
        descricao: values.descricao.trim(),
        unidade: values.unidade,
        quantidadeAtual: Number(values.quantidadeAtual) || 0,
        quantidadeMinima: Number(values.quantidadeMinima) || 0,
        precoCompra: Number(values.precoCompra) || 0,
        dataCompra: values.dataCompra || "",
        fornecedor: {
          nome: values.fornecedorNome.trim(),
          contato: values.fornecedorContato.trim(),
        },
        imagemUrl: values.imagemUrl || "",
      },
      isEdit
    );
  };

  return (
    <Dialog open={open} onClose={onClose} fullWidth maxWidth="sm">
      <DialogTitle sx={{ textTransform: "uppercase", fontWeight: "bold" }}>
        {isEdit ? "EDITAR PRODUTO" : "NOVO PRODUTO"}
      </DialogTitle>
      <DialogContent>
        <Stack spacing={2} sx={{ mt: 1 }}>
          <TextField
            label="NOME DO PRODUTO"
            value={values.nome}
            onChange={(e) => set("nome", e.target.value)}
            fullWidth
            autoFocus
          />
          <Stack direction={{ xs: "column", sm: "row" }} spacing={2}>
            <TextField
              label="CÓDIGO / SKU"
              value={values.codigo}
              onChange={(e) => set("codigo", e.target.value)}
              fullWidth
            />
            <FormControl fullWidth>
              <InputLabel id="unidade-label">UNIDADE</InputLabel>
              <Select
                labelId="unidade-label"
                value={values.unidade}
                label="UNIDADE"
                onChange={(e) => set("unidade", e.target.value)}
              >
                {UNIDADES.map((u) => (
                  <MenuItem key={u} value={u}>{u}</MenuItem>
                ))}
              </Select>
            </FormControl>
          </Stack>

          <Stack direction={{ xs: "column", sm: "row" }} spacing={2}>
            <NumField
              label="QUANTIDADE ATUAL"
              value={values.quantidadeAtual}
              onChange={(v) => set("quantidadeAtual", v)}
              disabled={isEdit}
              helperText={isEdit ? "Use MOVIMENTAR pra alterar" : "Estoque inicial"}
            />
            <NumField
              label="QUANTIDADE MÍNIMA"
              value={values.quantidadeMinima}
              onChange={(v) => set("quantidadeMinima", v)}
            />
          </Stack>

          <Stack direction={{ xs: "column", sm: "row" }} spacing={2}>
            <NumField
              label="PREÇO DE COMPRA (R$)"
              value={values.precoCompra}
              onChange={(v) => set("precoCompra", v)}
            />
            <TextField
              label="DATA DA COMPRA"
              type="date"
              value={values.dataCompra}
              onChange={(e) => set("dataCompra", e.target.value)}
              fullWidth
              InputLabelProps={{ shrink: true }}
            />
          </Stack>

          <Stack direction={{ xs: "column", sm: "row" }} spacing={2}>
            <TextField
              label="FORNECEDOR (NOME)"
              value={values.fornecedorNome}
              onChange={(e) => set("fornecedorNome", e.target.value)}
              fullWidth
            />
            <TextField
              label="CONTATO"
              value={values.fornecedorContato}
              onChange={(e) => set("fornecedorContato", e.target.value)}
              fullWidth
              placeholder="(00) 00000-0000"
            />
          </Stack>

          <TextField
            label="DESCRIÇÃO"
            value={values.descricao}
            onChange={(e) => set("descricao", e.target.value)}
            fullWidth
            multiline
            minRows={2}
          />

          <ImagemUploadField
            value={values.imagemUrl}
            onChange={(v) => set("imagemUrl", v)}
          />

          {isEdit && (
            <>
              <Button
                variant="outlined"
                color="warning"
                onClick={() => onMovimentar(initial)}
                fullWidth
              >
                📥 MOVIMENTAR ESTOQUE
              </Button>
              {Array.isArray(initial?.historico) && initial.historico.length > 0 && (
                <Typography variant="caption" color="#888">
                  {initial.historico.length} movimentaç(ões) registrada(s) no histórico.
                </Typography>
              )}
            </>
          )}
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>CANCELAR</Button>
        <Button variant="contained" onClick={handleSave}>SALVAR</Button>
      </DialogActions>
    </Dialog>
  );
}
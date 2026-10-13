// src/components/estoque/ImagemUploadField.jsx
import { useState } from "react";
import { Avatar, Box, Button, CircularProgress, Stack } from "@mui/material";
import AddAPhotoIcon from "@mui/icons-material/AddAPhoto";
import { uploadImage } from "../../services/cloudinary";

export default function ImagemUploadField({ value, onChange }) {
  const [uploading, setUploading] = useState(false);

  const handleFile = async (e) => {
    const file = e?.target?.files?.[0];
    if (!file) return;
    setUploading(true);
    try {
      const url = await uploadImage(file);
      onChange(url);
    } catch (err) {
      console.error(err);
      alert("Erro ao enviar imagem.");
    } finally {
      setUploading(false);
    }
  };

  return (
    <Stack direction="row" spacing={2} alignItems="center">
      <Avatar src={value || ""} variant="rounded" sx={{ width: 64, height: 64, bgcolor: "#2a2a2a" }}>
        {!value && "?"}
      </Avatar>
      <Box>
        <Button
          variant="outlined"
          component="label"
          size="small"
          startIcon={uploading ? <CircularProgress size={16} /> : <AddAPhotoIcon />}
          disabled={uploading}
        >
          {uploading ? "ENVIANDO..." : "ESCOLHER IMAGEM"}
          <input hidden accept="image/*" type="file" onChange={handleFile} />
        </Button>
        {value && (
          <Button size="small" color="error" onClick={() => onChange("")} sx={{ ml: 1 }}>
            REMOVER
          </Button>
        )}
      </Box>
    </Stack>
  );
}
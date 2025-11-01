// src/utils/faceRecognition.js
// utilitários para carregar modelos e comparar descritores com face-api.js

import * as faceapi from "face-api.js";

/**
 * Carrega os modelos usados pelo face-api (coloque os modelos em public/models)
 * @param {string} modelsPath caminho público para os modelos (ex: "/models")
 */
export async function loadFaceApiModels(modelsPath = import.meta.env.VITE_FACEAPI_MODELS || "/models") {
  // modelos necessários: ssdMobilenetv1 (detector), faceLandmark68Net, faceRecognitionNet
  await Promise.all([
    faceapi.nets.ssdMobilenetv1.loadFromUri(modelsPath),
    faceapi.nets.faceLandmark68Net.loadFromUri(modelsPath),
    faceapi.nets.faceRecognitionNet.loadFromUri(modelsPath),
  ]);
}

/**
 * Recebe um elemento HTMLImageElement ou HTMLVideoElement ou um canvas e retorna o descriptor (Float32Array) ou null
 * @param {HTMLImageElement|HTMLVideoElement|HTMLCanvasElement} input
 */
export async function getFaceDescriptorFromMedia(input) {
  if (!input) return null;
  const detection = await faceapi
    .detectSingleFace(input)
    .withFaceLandmarks()
    .withFaceDescriptor();
  if (!detection) return null;
  return detection.descriptor; // Float32Array (length 128)
}

/**
 * Compara dois descritores e retorna objeto com distance e match boolean.
 * threshold padrão entre 0.4 e 0.6 (menor = mais rigoroso). 0.6 típico.
 * @param {Float32Array} descA
 * @param {Float32Array} descB
 * @param {number} threshold
 */
export function compareDescriptors(descA, descB, threshold = 0.55) {
  if (!descA || !descB) return { match: false, distance: Infinity };
  // Euclidean distance
  let sum = 0;
  for (let i = 0; i < descA.length; i++) {
    const diff = descA[i] - descB[i];
    sum += diff * diff;
  }
  const distance = Math.sqrt(sum);
  return { match: distance <= threshold, distance };
}

/**
 * Convert Float32Array descriptor to JSON-serializable array (para salvar no Firestore)
 */
export function descriptorToArray(desc) {
  return Array.from(desc || []);
}

/**
 * Converter de array (do Firestore) para Float32Array pra comparar
 */
export function arrayToDescriptor(arr = []) {
  return new Float32Array(arr);
}

/**
 * --- Funções utilitárias extras (não removem suas funções originais)
 * Carregar uma imagem a partir de uma URL e retornar um HTMLImageElement.
 */
export function createImageElementFromUrl(url) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    // Evita problema de CORS quando a imagem está no cloudinary (Cloudinary permite cross origin por padrão)
    img.crossOrigin = "anonymous";
    img.onload = () => resolve(img);
    img.onerror = (e) => reject(new Error("Falha ao carregar imagem: " + e));
    img.src = url;
  });
}

/**
 * Criar imagem a partir de dataURL (string) e retornar HTMLImageElement
 */
export function createImageElementFromDataUrl(dataUrl) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = (e) => reject(new Error("Falha ao criar imagem do dataURL: " + e));
    img.src = dataUrl;
  });
}
/**
 * Verifica se o rosto atual da webcam bate com o descriptor salvo.
 * @param {Blob} blob - imagem capturada ao vivo (da webcam)
 * @param {string} dataUrl - versão base64 (para exibir, se quiser)
 * @param {Function} onSuccess - callback se bater
 * @param {Function} onFail - callback se não bater
 * @param {Float32Array} referenceDescriptor - descriptor salvo (ex: funcData.faceDescriptor)
 * @param {number} threshold - sensibilidade da comparação
 */
export async function verifyLiveAgainstReference(
  blob,
  dataUrl,
  onSuccess,
  onFail,
  referenceDescriptor,
  threshold = 0.55
) {
  try {
    const image = await createImageElementFromDataUrl(dataUrl);
    const detection = await faceapi
      .detectSingleFace(image)
      .withFaceLandmarks()
      .withFaceDescriptor();

    if (!detection) {
      onFail("Nenhum rosto detectado. Tente novamente com mais luz.");
      return;
    }

    const { match, distance } = compareDescriptors(
      detection.descriptor,
      referenceDescriptor,
      threshold
    );

    console.log("🔍 Comparação facial:", { match, distance });

    if (match) onSuccess();
    else onFail("Rosto não reconhecido. Tente novamente.");

  } catch (err) {
    console.error("Erro ao verificar rosto:", err);
    onFail("Erro ao processar reconhecimento facial.");
  }
}

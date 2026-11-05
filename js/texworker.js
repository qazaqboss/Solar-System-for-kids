// Фоновый поток: считает пиксели процедурных текстур, не блокируя страницу.
import { renderPixels } from "./textures.js";
self.onmessage = (e) => {
  const { id, look, w, h } = e.data;
  const px = renderPixels(look, w, h);
  self.postMessage({ id, px }, [px.buffer]);
};

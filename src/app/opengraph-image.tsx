import { alt, contentType, generateOgImage, size } from "./og-shared";

export { alt, contentType, size };

export default function Image() {
  return generateOgImage();
}

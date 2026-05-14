import { createSocialImage, socialImageAlt } from "./social-image";

export const alt = socialImageAlt;
export const size = {
  width: 1200,
  height: 600
};
export const contentType = "image/png";

export default function Image() {
  return createSocialImage(size);
}

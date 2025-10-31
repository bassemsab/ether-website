import { ImageResponse } from "next/og";

export const size = {
  width: 64,
  height: 64,
};

export const contentType = "image/png";

export default function Icon() {
  return new ImageResponse(
    (
      <img
        src="https://img.ether.paris/ether-website/assets/ether.png?width=256"
        alt="Sabbagh Medical logotype"
        style={{
          width: "100%",
          height: "100%",
          objectFit: "cover",
          borderRadius: "12%",
        }}
      />
    ),
    size,
  );
}

export default function Image({ src, alt = "", width, height, fill, priority, quality, placeholder, blurDataURL, unoptimized, loader, sizes, ...rest }) {
  const style = fill
    ? { position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: rest.style?.objectFit || "cover", ...rest.style }
    : rest.style;
  return <img src={src} alt={alt} width={width} height={height} {...rest} style={style} />;
}

/** A 1×1 transparent image: what a phone loads instead of the picture, which it never shows. */
const NOTHING = 'data:image/gif;base64,R0lGODlhAQABAAAAACH5BAEKAAEALAAAAAABAAEAAAICTAEAOw==';

interface WidePictureProps {
  readonly src: string;
  readonly alt: string;
  /** Classes for the image itself. */
  readonly className?: string;
}

/** An image for desktop and projector layouts only (1024 px and wider): a phone never downloads it. */
export function WidePicture({ src, alt, className = '' }: WidePictureProps) {
  return (
    <picture>
      <source media="(min-width: 1024px)" srcSet={src} />
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={NOTHING} alt={alt} className={className} />
    </picture>
  );
}

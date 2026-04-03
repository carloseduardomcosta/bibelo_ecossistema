import { Container, clx } from "@medusajs/ui"
import Image from "next/image"
import React from "react"

type ThumbnailProps = {
  thumbnail?: string | null
  images?: any[] | null
  size?: "small" | "medium" | "large" | "full" | "square"
  isFeatured?: boolean
  className?: string
  productTitle?: string
  "data-testid"?: string
}

const Thumbnail: React.FC<ThumbnailProps> = ({
  thumbnail,
  images,
  size = "small",
  isFeatured,
  className,
  productTitle,
  "data-testid": dataTestid,
}) => {
  const initialImage = thumbnail || images?.[0]?.url

  return (
    <Container
      className={clx(
        "relative w-full overflow-hidden p-0 bg-bibelo-rosa/30 shadow-sm rounded-2xl group-hover:shadow-md transition-shadow ease-in-out duration-200",
        className,
        {
          "aspect-[1/1]": isFeatured || size === "square",
          "aspect-[9/16]": !isFeatured && size !== "square",
          "w-[180px]": size === "small",
          "w-[290px]": size === "medium",
          "w-[440px]": size === "large",
          "w-full": size === "full",
        }
      )}
      data-testid={dataTestid}
    >
      <ImageOrPlaceholder image={initialImage} size={size} productTitle={productTitle} />
    </Container>
  )
}

const ImageOrPlaceholder = ({
  image,
  size,
  productTitle,
}: Pick<ThumbnailProps, "size" | "productTitle"> & { image?: string }) => {
  const initial = productTitle ? productTitle.charAt(0).toUpperCase() : "?"

  return image ? (
    <Image
      src={image}
      alt={productTitle || "Produto"}
      className="absolute inset-0 object-cover object-center"
      draggable={false}
      quality={95}
      sizes="(max-width: 640px) 290px, (max-width: 1024px) 440px, 540px"
      fill
    />
  ) : (
    <div className="w-full h-full absolute inset-0 flex items-center justify-center bg-bibelo-rosa/40">
      <span className="font-heading text-4xl font-semibold text-bibelo-pink/50">
        {initial}
      </span>
    </div>
  )
}

export default Thumbnail

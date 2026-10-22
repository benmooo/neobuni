import {
  Avatar,
  AvatarFallback,
  AvatarImage,
} from "@neobuni/ui/components/avatar";
import { cn } from "@neobuni/ui/lib/utils";
import { useEffect, useState } from "react";
import buniDefaultAvatarUri from "@/assets/buni-default-avatar.svg";

interface Props {
  aiName: string;
  avatarUri?: string;
  className?: string;
  fallbackClassName?: string;
  imageClassName?: string;
  size?: "default" | "sm" | "lg";
}

const getAvatarFallback = (aiName: string) =>
  aiName.trim().length > 0 ? aiName.trim()[0] : "B";

const normalizeAvatarUri = (avatarUri?: string) => avatarUri?.trim() ?? "";

const getAvatarImageSource = (avatarUri: string) =>
  avatarUri.length > 0 ? avatarUri : buniDefaultAvatarUri;

function BuniAvatar({
  aiName,
  avatarUri = "",
  size = "default",
  className,
  imageClassName,
  fallbackClassName,
}: Props) {
  const normalizedAvatarUri = normalizeAvatarUri(avatarUri);
  const [imageSource, setImageSource] = useState(() =>
    getAvatarImageSource(normalizedAvatarUri)
  );

  useEffect(() => {
    setImageSource(getAvatarImageSource(normalizedAvatarUri));
  }, [normalizedAvatarUri]);

  const handleImageError = () => {
    if (imageSource !== buniDefaultAvatarUri) {
      setImageSource(buniDefaultAvatarUri);
      return;
    }

    setImageSource("");
  };

  return (
    <Avatar className={className} size={size}>
      {imageSource.length > 0 ? (
        <AvatarImage
          alt={`${aiName} avatar`}
          className={imageClassName}
          onError={handleImageError}
          src={imageSource}
        />
      ) : null}
      <AvatarFallback
        className={cn("font-semibold text-xs", fallbackClassName)}
      >
        {getAvatarFallback(aiName)}
      </AvatarFallback>
    </Avatar>
  );
}

export { BuniAvatar };

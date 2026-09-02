"use client";

import { useEffect, useMemo, useState } from "react";
import { companyAvatarStyle, companyInitials, companyLogoUrls } from "../lib/modelLogos";

type Props = {
    name: string;
    companySlug: string;
    companyName?: string;
    websiteUrl?: string | null;
    fallbackSlugs?: string[];
    size?: "sm" | "md";
};

const MIN_LOGO_SIZE = 20;

export default function ModelAvatar({
    name,
    companySlug,
    companyName,
    websiteUrl,
    fallbackSlugs = [],
    size = "md",
}: Props) {
    const label = companyName ?? name;
    const initials = companyInitials(label);
    const logoUrls = useMemo(
        () => companyLogoUrls(companySlug, websiteUrl, fallbackSlugs),
        // fallbackSlugs is compared by value; callers often pass inline arrays
        // eslint-disable-next-line react-hooks/exhaustive-deps
        [companySlug, websiteUrl, fallbackSlugs.join("|")],
    );
    const [logoIndex, setLogoIndex] = useState(0);
    const fallbackStyle = useMemo(() => companyAvatarStyle(companySlug), [companySlug]);

    useEffect(() => {
        setLogoIndex(0);
    }, [logoUrls]);

    const logoUrl = logoUrls[logoIndex];
    if (!logoUrl || logoIndex >= logoUrls.length) {
        return (
            <span
                className={`model-avatar model-avatar-${size} fallback`}
                style={fallbackStyle}
                aria-hidden="true"
            >
                {initials}
            </span>
        );
    }

    return (
        <img
            className={`model-avatar model-avatar-${size}`}
            src={logoUrl}
            alt=""
            loading="lazy"
            decoding="async"
            onLoad={event => {
                const img = event.currentTarget;
                if (img.naturalWidth < MIN_LOGO_SIZE || img.naturalHeight < MIN_LOGO_SIZE)
                    setLogoIndex(index => index + 1);
            }}
            onError={() => setLogoIndex(index => index + 1)}
        />
    );
}

"use client";

import { useMemo, useState } from "react";
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
    const logoKey = `${companySlug}|${websiteUrl ?? ""}|${fallbackSlugs.join("|")}`;
    const logoUrls = companyLogoUrls(companySlug, websiteUrl, fallbackSlugs);
    const [logoAttempt, setLogoAttempt] = useState({ key: logoKey, index: 0 });
    const logoIndex = logoAttempt.key === logoKey ? logoAttempt.index : 0;
    const fallbackStyle = useMemo(() => companyAvatarStyle(companySlug), [companySlug]);

    const tryNextLogo = () => {
        setLogoAttempt(current => ({
            key: logoKey,
            index: (current.key === logoKey ? current.index : 0) + 1,
        }));
    };

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
                    tryNextLogo();
            }}
            onError={tryNextLogo}
        />
    );
}

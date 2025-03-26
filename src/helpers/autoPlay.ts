import { fetch as undiciFetch } from 'undici';
import crypto from 'crypto';
import { JSDOM } from 'jsdom';

export async function scAutoPlay(url: string): Promise<string[]> {
    const res = await undiciFetch(`${url}/recommended`);

    if (res.status !== 200) {
        throw new Error(`Failed to fetch URL. Status code: ${res.status}`);
    }

    const html = await res.text();
    const dom = new JSDOM(html);
    const document = dom.window.document;

    // Ensure `noscript` elements exist before accessing index [1]
    const secondNoscript = document.querySelectorAll('noscript')[1];
    if (!secondNoscript) {
        throw new Error('Could not find second <noscript> element');
    }

    const sectionElement = secondNoscript.querySelector('section');
    if (!sectionElement) {
        throw new Error('Could not find section element');
    }

    const articleElements = sectionElement.querySelectorAll('article');

    // Extract URLs and return an array
    return Array.from(articleElements)
        .map(articleElement => {
            const h2Element = articleElement.querySelector('h2[itemprop="name"]');
            if (!h2Element) return null;

            const aElement = h2Element.querySelector('a[itemprop="url"]');
            if (!aElement) return null;

            return `https://soundcloud.com${aElement.getAttribute('href')}`;
        })
        .filter((href): href is string => href !== null); // Remove `null` values
}
export async function spAutoPlay(track_id: string): Promise<string> {
    const TOTP_SECRET: Uint8Array = new Uint8Array([
        53, 53, 48, 55, 49, 52, 53, 56, 53, 51, 52, 56, 55, 52, 57, 57, 
        53, 57, 50, 50, 52, 56, 54, 51, 48, 51, 50, 57, 51, 52, 55
    ]);

    function generateTotp(): [string, number] {
        const counter = Math.floor(Date.now() / 30000);
        const counterBuffer = Buffer.alloc(8);
        counterBuffer.writeBigInt64BE(BigInt(counter));

        const hmac = crypto.createHmac('sha1', TOTP_SECRET);
        hmac.update(counterBuffer);
        const hmacResult = hmac.digest();

        const offset = hmacResult[hmacResult.length - 1] & 15;
        const truncatedValue =
            ((hmacResult[offset] & 127) << 24) |
            ((hmacResult[offset + 1] & 255) << 16) |
            ((hmacResult[offset + 2] & 255) << 8) |
            (hmacResult[offset + 3] & 255);

        const totp = (truncatedValue % 1000000).toString().padStart(6, '0');
        return [totp, counter * 30000];
    }

    const [totp, timestamp] = generateTotp();
    const params = new URLSearchParams({
        reason: "transport",
        productType: "embed",
        totp,
        totpVer: "5",
        ts: timestamp.toString(),
    });

    let accessToken: string;
    try {
        const tokenResponse = await undiciFetch(`https://open.spotify.com/get_access_token?${params.toString()}`);
        if (!tokenResponse.ok) throw new Error(`Token request failed: ${tokenResponse.statusText}`);

        const tokenData = (await tokenResponse.json()) as { accessToken: string };
        if (!tokenData.accessToken) throw new Error("Access token missing in response.");

        accessToken = tokenData.accessToken;
    } catch (error) {
        throw new Error(`Failed to fetch access token: ${(error as Error).message}`);
    }

    let recommendedTracks: { id: string }[];
    try {
        const recommendationsResponse = await undiciFetch(
            `https://api.spotify.com/v1/recommendations?limit=10&seed_tracks=${track_id}`,
            {
                headers: {
                    Authorization: `Bearer ${accessToken}`,
                    'Content-Type': 'application/json',
                },
            }
        );

        if (!recommendationsResponse.ok) {
            throw new Error(`Spotify API request failed: ${recommendationsResponse.statusText}`);
        }

        const recommendationsData = (await recommendationsResponse.json()) as { tracks: { id: string }[] };
        recommendedTracks = recommendationsData.tracks;
    } catch (error) {
        throw new Error(`Failed to fetch recommendations: ${(error as Error).message}`);
    }

    if (!recommendedTracks || recommendedTracks.length === 0) {
        throw new Error("No recommended tracks found.");
    }

    return recommendedTracks[Math.floor(Math.random() * recommendedTracks.length)].id;
}

import type { CollaborationUserInfo } from "@drawdy/driver-protocol";

export const GUEST_ADJECTIVES = [
    "Sneaky", "Sleepy", "Dancing", "Spicy", "Wiggly", "Chaotic", "Funky", "Grumpy", "Cosmic", "Turbo",
    "Dizzy", "Chunky", "Sassy", "Wobbly", "Crispy", "Dramatic", "Fluffy", "Jazzy", "Cranky", "Zesty",
    "Clumsy", "Bouncy", "Rowdy", "Soggy", "Goofy", "Sparkly", "Moody", "Chonky", "Vibing", "Cursed",
] as const;

export const GUEST_ANIMALS = [
    "Otter", "Platypus", "Llama", "Capybara", "Raccoon", "Axolotl", "Narwhal", "Penguin",
    "Ferret", "Hedgehog", "Quokka", "Wombat", "Panda", "Sloth", "Alpaca", "Corgi",
] as const;

const adjectives = new Set<string>(GUEST_ADJECTIVES);
const animals = new Set<string>(GUEST_ANIMALS);

export function isGuestName(name: string): boolean {
    const parts = name.trim().split(" ");
    return parts.length === 2 && adjectives.has(parts[0]) && animals.has(parts[1]);
}

export function looksSignedUp(user: Pick<CollaborationUserInfo, "name" | "image">): boolean {
    if (user.image) return true;
    return user.name.trim().length > 0 && !isGuestName(user.name);
}

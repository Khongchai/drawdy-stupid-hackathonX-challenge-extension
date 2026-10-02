import { describe, expect, it } from "vitest";
import { GUEST_ADJECTIVES, GUEST_ANIMALS, isGuestName, looksSignedUp } from "./sign-up";

const avatarUrl = "https://lh3.googleusercontent.com/a/avatar";

describe("looksSignedUp", () => {
    it("treats every random guest name with no avatar as not signed up", () => {
        for (const adjective of GUEST_ADJECTIVES) {
            for (const animal of GUEST_ANIMALS) {
                expect(looksSignedUp({ name: `${adjective} ${animal}` })).toBe(false);
            }
        }
    });

    it("treats a user with an account avatar as signed up even when the name looks random", () => {
        expect(looksSignedUp({ name: "Sneaky Otter", image: avatarUrl })).toBe(true);
    });

    it("treats a user whose name is not a random guest name as signed up", () => {
        expect(looksSignedUp({ name: "Khongchai Greesuradej" })).toBe(true);
    });

    it("treats an empty name with no avatar as not signed up", () => {
        expect(looksSignedUp({ name: "   " })).toBe(false);
    });
});

describe("isGuestName", () => {
    it("does not match a name that only contains a guest adjective and animal among other words", () => {
        expect(isGuestName("The Sneaky Otter")).toBe(false);
    });
});

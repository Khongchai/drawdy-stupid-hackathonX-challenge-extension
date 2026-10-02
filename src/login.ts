import { send } from "./host";

export type LoginState = "logged-in" | "guest" | "unknown";

export async function checkLoggedIn(): Promise<LoginState> {
    try {
        const { loggedIn } = await send({ type: "command:auth:check-logged-in" });
        return loggedIn ? "logged-in" : "guest";
    } catch {
        return "unknown";
    }
}

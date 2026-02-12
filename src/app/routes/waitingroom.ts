import app from "..";

app.get("/waitingroom/api/waitingroom", (c) => {
    return c.sendStatus(204);
});
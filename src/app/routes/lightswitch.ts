import app from "..";

app.get("/lightswitch/api/service/bulk/status", async (c) => {
    return c.json([
        {
        allowedActions : [ "PLAY", "DOWNLOAD" ],
        banned : false,
        launcherInfoDTO : {
           appName : "Fortnite",
           catalogItemId : "4fe75bbc5a674f4f9b356b5c90567da5",
           namespace : "fn"
        },
        maintenanceUri : null,
        message : "Fortnite is online",
        overrideCatalogIds : [ "a7f138b2e51945ffbfdacc1af0541053" ],
        serviceInstanceId : "fortnite",
        status : "UP"
        }
    ]);
});
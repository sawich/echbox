import { createFakeTransport } from "../proxy/__tests__/helpers";
import { setContentBlobTestDefaults } from "../proxy/content-blob-service";

setContentBlobTestDefaults({
  transport: createFakeTransport(),
  chatId: "-100999",
});

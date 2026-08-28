import { z } from "zod";

export const dealDraftSchema = z.object({
  description: z
    .string()
    .trim()
    .min(10, "Добавьте хотя бы 10 символов")
    .max(500, "Описание не должно превышать 500 символов"),
  title: z
    .string()
    .trim()
    .min(3, "Название должно содержать хотя бы 3 символа")
    .max(80, "Название не должно превышать 80 символов"),
  type: z.enum(["rent", "services", "sale"], {
    message: "Выберите тип сделки",
  }),
});

export type DealDraftInput = z.infer<typeof dealDraftSchema>;

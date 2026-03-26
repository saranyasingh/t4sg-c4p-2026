"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import { useTranslation } from "react-i18next";
import { useMemo, useState, type BaseSyntheticEvent, type MouseEvent } from "react";
import * as z from "zod";

import { Button } from "@/components/ui/button";
import { Form, FormControl, FormDescription, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "@/components/ui/use-toast";
import { createBrowserSupabaseClient } from "@/lib/client-utils";
import { type Database } from "@/lib/schema";
import { useRouter } from "next/navigation";

type Profile = Database["public"]["Tables"]["profiles"]["Row"];

function getProfileFormSchema(t: (key: string) => string) {
  return z.object({
    username: z
      .string()
      .min(2, { message: t("profileForm.validationUsernameMin") })
      .max(30, { message: t("profileForm.validationUsernameMax") })
      .transform((val) => val.trim()),
    bio: z
      .string()
      .max(160, { message: t("profileForm.validationBioMax") })
      .nullable()
      .transform((val) => (!val || val.trim() === "" ? null : val.trim())),
  });
}

type ProfileFormValues = z.infer<ReturnType<typeof getProfileFormSchema>>;

export default function ProfileForm({ profile }: { profile: Profile }) {
  const { t } = useTranslation();
  const [isEditing, setIsEditing] = useState(false);

  const profileFormSchema = useMemo(() => getProfileFormSchema(t), [t]);

  const defaultValues = {
    username: profile.display_name,
    bio: profile.biography,
  };

  const form = useForm<ProfileFormValues>({
    resolver: zodResolver(profileFormSchema),
    defaultValues,
    mode: "onChange",
  });

  const router = useRouter();

  const onSubmit = async (data: ProfileFormValues) => {
    const supabase = createBrowserSupabaseClient();
    const { error } = await supabase
      .from("profiles")
      .update({ biography: data.bio, display_name: data.username })
      .eq("id", profile.id);

    if (error) {
      return toast({
        title: t("profileForm.toastError"),
        description: error.message,
        variant: "destructive",
      });
    }

    setIsEditing(false);

    // Reset form values to the data values that have been processed by zod.
    // This way the user sees any changes that have occurred during transformation
    form.reset(data);

    // Router.refresh does not affect ProfileForm because it is a client component, but it will refresh the initials in the user-nav in the event of a username change
    router.refresh();

    return toast({
      title: t("profileForm.toastSuccess"),
    });
  };

  const startEditing = (e: MouseEvent) => {
    e.preventDefault();
    setIsEditing(true);
  };

  const handleCancel = (e: MouseEvent) => {
    e.preventDefault();
    form.reset(defaultValues);
    setIsEditing(false);
  };

  return (
    <Form {...form}>
      <form onSubmit={(e: BaseSyntheticEvent) => void form.handleSubmit(onSubmit)(e)} className="space-y-8">
        <FormField
          control={form.control}
          name="username"
          render={({ field }) => (
            <FormItem>
              <FormLabel>{t("profileForm.usernameLabel")}</FormLabel>
              <FormControl>
                <Input readOnly={!isEditing} placeholder={t("profileForm.usernameLabel")} {...field} />
              </FormControl>
              <FormDescription>
                {t("profileForm.usernameDescription")}
              </FormDescription>
              <FormMessage />
            </FormItem>
          )}
        />
        <FormItem>
          <FormLabel>{t("profileForm.emailLabel")}</FormLabel>
          <FormControl>
            <Input readOnly placeholder={profile.email} />
          </FormControl>
          <FormDescription>{t("profileForm.emailDescription")}</FormDescription>
          <FormMessage />
        </FormItem>
        <FormField
          control={form.control}
          name="bio"
          render={({ field }) => {
            // We must extract value from field and convert a potential defaultValue of `null` to "" because textareas can't handle null values: https://github.com/orgs/react-hook-form/discussions/4091
            const { value, ...rest } = field;
            return (
              <FormItem>
                <FormLabel>{t("profileForm.bioLabel")}</FormLabel>
                <FormControl>
                  <Textarea
                    readOnly={!isEditing}
                    value={value ?? ""}
                    placeholder={t("profileForm.bioPlaceholder")}
                    className="resize-none"
                    {...rest}
                  />
                </FormControl>
                <FormDescription>{t("profileForm.bioDescription")}</FormDescription>
                <FormMessage />
              </FormItem>
            );
          }}
        />
        {isEditing ? (
          <>
            <Button type="submit" className="mr-2">
              {t("profileForm.updateButton")}
            </Button>
            <Button variant="secondary" onClick={handleCancel}>
              {t("profileForm.cancelButton")}
            </Button>
          </>
        ) : (
          <Button onClick={startEditing}>{t("profileForm.editButton")}</Button>
        )}
      </form>
    </Form>
  );
}

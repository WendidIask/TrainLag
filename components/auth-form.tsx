"use client";

import type React from "react";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Loader2 } from "lucide-react";
import { signIn, signUp } from "@/lib/auth-actions";

function SubmitButton({ children, ...props }: { children: React.ReactNode }) {
  const { pending } = useFormStatus();

  return (
    <Button type="submit" disabled={pending} className="w-full" {...props}>
      {pending ? (
        <>
          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
          Loading...
        </>
      ) : (
        children
      )}
    </Button>
  );
}

export default function AuthForm() {
  const [loginState, loginAction] = useActionState(signIn, null);
  const [signUpState, signUpAction] = useActionState(signUp, null);

  return (
    <Card className="shadow-xl">
      <CardHeader>
        <CardTitle className="text-center">Welcome</CardTitle>
        <CardDescription className="text-center">Sign in to your account or create a new one</CardDescription>
      </CardHeader>
      <CardContent>
        <Tabs defaultValue="login" className="w-full">
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="login">Login</TabsTrigger>
            <TabsTrigger value="register">Register</TabsTrigger>
          </TabsList>

          <TabsContent value="login">
            <form action={loginAction} className="space-y-4">
              {loginState?.error && (
                <div className="bg-red-500/10 border border-red-500/50 text-red-700 px-4 py-3 rounded">
                  {loginState.error}
                </div>
              )}

              <div className="space-y-2">
                <Label htmlFor="login-email">Email</Label>
                <Input id="login-email" name="email" type="email" placeholder="you@example.com" required />
              </div>
              <div className="space-y-2">
                <Label htmlFor="login-password">Password</Label>
                <Input id="login-password" name="password" type="password" required />
              </div>
              <SubmitButton>Sign In</SubmitButton>
            </form>
          </TabsContent>

          <TabsContent value="register">
            <form action={signUpAction} className="space-y-4">
              {signUpState?.error && (
                <div className="bg-red-500/10 border border-red-500/50 text-red-700 px-4 py-3 rounded">
                  {signUpState.error}
                </div>
              )}

              {/* {signUpState?.success && (
                <div className="bg-green-500/10 border border-green-500/50 text-green-700 px-4 py-3 rounded">
                  {signUpState.success}
                </div>
              )} */}

              <div className="space-y-2">
                <Label htmlFor="register-username">Username</Label>
                <Input id="register-username" name="username" type="text" placeholder="Your username" required />
              </div>
              <div className="space-y-2">
                <Label htmlFor="register-email">Email</Label>
                <Input id="register-email" name="email" type="email" placeholder="you@example.com" required />
              </div>
              <div className="space-y-2">
                <Label htmlFor="register-password">Password</Label>
                <Input id="register-password" name="password" type="password" required />
              </div>
              <SubmitButton>Create Account</SubmitButton>
            </form>
          </TabsContent>
        </Tabs>
      </CardContent>
    </Card>
  );
}

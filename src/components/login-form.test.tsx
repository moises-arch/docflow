import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { LoginForm } from "./login-form";

describe("LoginForm", () => {
  it("renders the welcome heading", () => {
    render(<LoginForm />);
    expect(screen.getByText("Welcome back")).toBeTruthy();
  });

  it("renders email and password inputs", () => {
    render(<LoginForm />);
    expect(screen.getByLabelText("Email")).toBeTruthy();
    expect(screen.getByLabelText("Password")).toBeTruthy();
  });

  it("renders Apple and Google login buttons", () => {
    render(<LoginForm />);
    expect(screen.getByText("Login with Apple")).toBeTruthy();
    expect(screen.getByText("Login with Google")).toBeTruthy();
  });

  it("renders the submit button", () => {
    render(<LoginForm />);
    expect(screen.getByRole("button", { name: "Login" })).toBeTruthy();
  });

  it("renders the forgot password link", () => {
    render(<LoginForm />);
    expect(screen.getByText("Forgot your password?")).toBeTruthy();
  });

  it("renders the sign up link", () => {
    render(<LoginForm />);
    expect(screen.getByText(/sign up/i)).toBeTruthy();
  });

  it("applies custom className to the root element", () => {
    const { container } = render(<LoginForm className="custom-class" />);
    expect(container.firstChild).toHaveClass("custom-class");
  });

  it("forwards extra div props to the root element", () => {
    render(<LoginForm data-testid="login-form" />);
    expect(screen.getByTestId("login-form")).toBeTruthy();
  });
});

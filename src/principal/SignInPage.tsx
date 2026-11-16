import { Alert, Button, LoginPage, Stack, StackItem } from '@patternfly/react-core';
import { useState } from 'react';
import { product } from '../config/product';

/** A refusal the gateway sent back from the sign-in (`/?signin=…`), read once and cleared from the address. */
function refusalFromAddress(): string | undefined {
  const params = new URLSearchParams(window.location.search);
  const reason = params.get('signin') ?? undefined;
  if (reason) {
    params.delete('signin');
    const rest = params.toString();
    window.history.replaceState(null, '', `${window.location.pathname}${rest ? `?${rest}` : ''}${window.location.hash}`);
  }
  return reason;
}

/**
 * Signing in (design system spec 4.1): PatternFly's Login page in place of the chrome, with Sign in with Google, which
 * goes to the gateway's sign-in. A refusal shows its reason, with Sign out to try another account.
 */
export function SignInPage({ reasons }: { reasons: string[] }) {
  const [fromAddress] = useState(refusalFromAddress);
  const refusal = [...reasons, ...(fromAddress ? [fromAddress] : [])];
  return (
    <LoginPage loginTitle={product.name} loginSubtitle="Sign in to continue">
      <Stack hasGutter>
        {refusal.length > 0 && (
          <StackItem>
            <Alert variant="danger" isInline title="You could not be signed in" component="h2">
              {refusal.join(' ')}
            </Alert>
          </StackItem>
        )}
        <StackItem>
          <Button component="a" href="/auth/login" variant="primary" isBlock>
            Sign in with Google
          </Button>
        </StackItem>
        {refusal.length > 0 && (
          <StackItem>
            <Button component="a" href="/auth/logout" variant="link" isInline>
              Sign out
            </Button>
          </StackItem>
        )}
      </Stack>
    </LoginPage>
  );
}

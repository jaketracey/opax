import { RouteErrorBoundary as RecoverablePage } from '../design/route-error';
import { useRouteErrorReporting } from '../analytics';

/** Modal stacks share the recoverable state and anonymous error reporting. */
export function RouteErrorBoundary(props: {
  error: Error;
  retry: () => Promise<void>;
}) {
  useRouteErrorReporting(props.error);
  return <RecoverablePage {...props} />;
}

import { handle } from '@/lib/api-util';
import { stakeTerms } from '@/lib/stake';

export const dynamic = 'force-dynamic';

/**
 * The published rate card. Public on purpose — the terms, the penalty, and how
 * much capacity the reserve can still back are exactly the things somebody
 * should be able to read before deciding whether to commit anything.
 */
export async function GET() {
  return handle(async () => stakeTerms());
}

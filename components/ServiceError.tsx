export default function ServiceError({ kind }: { kind?: string }) {
  return (
    <div className="state" role="alert">
      {kind === 'NOT_CONFIGURED' ? (
        <p>The collection is being prepared. Please check back soon or message Flora on Facebook.</p>
      ) : (
        <p>We couldn&apos;t load the collection right now. Please refresh the page in a moment.</p>
      )}
    </div>
  );
}

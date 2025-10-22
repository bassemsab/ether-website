import { testimonials } from '@/lib/utils/content';

export function Testimonials() {
  return (
    <div className="grid gap-6 lg:grid-cols-3">
      {testimonials.map((testimonial) => (
        <figure key={testimonial.author} className="retro-card flex h-full flex-col justify-between gap-6 p-8">
          <blockquote className="text-base leading-relaxed text-muted-foreground">
            “{testimonial.quote}”
          </blockquote>
          <figcaption className="space-y-1 text-sm">
            <div className="font-semibold text-foreground">{testimonial.author}</div>
            <div className="text-xs uppercase tracking-[0.3em] text-muted-foreground">{testimonial.role}</div>
          </figcaption>
        </figure>
      ))}
    </div>
  );
}

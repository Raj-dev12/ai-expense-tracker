# Receipt photos for measuring the OCR

Put the photos in this folder. Nothing in here is committed except this file —
see `.gitignore`. They are real receipts with real shop names and amounts on
them, and they stay on the machine that took them.

They are **not** in `frontend/public/`, deliberately. Anything in there is served
by the dev server and copied into a production build, so a stray photo would be
published. A photo here cannot be, because the harness reads it through the
browser's file picker and nothing ever serves it.

## Naming

```
<bucket>-<number>.jpg
```

The bucket is the part before the first hyphen, and it is the whole point of the
exercise — the four groups answer different questions, so a result averaged
across them answers none of them.

| Bucket | What it is | What it is there to tell you |
| --- | --- | --- |
| `flat` | Flat, good light, shot straight on | **The regression guard.** These read correctly today. If a change makes one of these worse, the change is a loss however much it helps elsewhere. |
| `dim` | Flat, shot straight on, poor or uneven light | The case local binarisation is supposed to fix. |
| `angled` | Flat, decent light, photographed at an angle | The case perspective correction is supposed to fix. |
| `creased` | A crumpled thermal receipt | Expected to stay broken. Here to catch a change that "improves" noise into something that looks like a reading. |

So:

```
flat-01.jpg     flat-02.jpg     flat-03.jpg
dim-01.jpg      dim-02.jpg
angled-01.jpg   angled-02.jpg
creased-01.jpg  creased-02.jpg
```

A file whose prefix is not one of those four is loaded into an `unsorted` group
rather than quietly counted in the wrong one.

Any format the browser opens is fine: `.jpg`, `.png`, `.heic`, `.webp`.

## What you type in

The harness asks for three things per photo — the merchant, the date and the
total, as printed on the paper. That is the ground truth, and it is the only
measure in this exercise that the preprocessing cannot influence. The engine's
own confidence rises whenever an image is made crisper, whether or not the
letters it picked were right, so it is logged and deliberately not scored.

Labels are kept in the browser's own storage, so they survive a reload and never
reach the repository or the server. The harness has a box to copy them out as
JSON if you want a backup.

### When a field is not on the receipt

Only the total is required. A field left blank is left out of the counts rather than scored as
a failure, so an unrecorded merchant does not make a preparation look worse than it is.

The date is the exception, and it is worth understanding. If the receipt genuinely does not
print one, **tick "no date on it"** instead of leaving the box empty. An empty box says "nobody
wrote it down", which can only be skipped. The tick says "the right answer is no date" — and
that makes any date the parser returns an invention, with nothing on the paper behind it.

That is a stronger test than a receipt *with* a date, because a correct answer sitting in the
way hides an invented one. It is not hypothetical: `findDate` takes the first date-shaped run of
digits on any line, and a product code reading `05-06-24` is accepted as 5 June 2024. A phone
number, a till number, a business id and a card number are all correctly refused, so the
exposure is that one shape — but that shape is on a lot of receipts.

-----
Post Title: A Rust procedural language handler for PostgreSQL | Hacker News
-----
Comments: 
[1] nextaccountic: Does it compile to wasm or otherwise sandbox the Rust binary?<p>If not, how can it be "trusted" if Rust has unsafe escapes that can read and write arbitrary memory? (And also, the Rust compiler has known soundness issues that makes it possible to run unsafe code in safe Rust,
[1.1] wffurr: >> PL/Rust uses the Rust compiler itself to wholesale disallow the use of unsafe in user functions. If a LANGUAGE plrust function uses unsafe it won't compile.<p>From 
[1.1.1] SkiFire13: Note that third party crates are still allowed to use `unsafe`. Moreover the rust compiler is not infallible and there are some soundness issues that have yet to be fixed.
[1.1.1.1] wffurr: Yes; they claim to also address this.  I'm not an expert and so can't pass judgement on their claims, but here's what they write (which you would see if you clicked the link and scrolled a bit):<p>>> The intent is that plrust-trusted-pgrx can evolve independently of both pgrx and plrust. There are a few "unsafe" parts of pgrx exposed through plrust-trusted-pgrx, but PL/Rust's ability to block unsafe renders them useless by PL/Rust user functions.<p>>> What about Rust compiler bugs?
PL/Rust uses its own rustc driver which enables it to apply custom lints to the user's LANGUAGE plrust function. In general, these lints will fail compilation if the user's code uses certain code idioms or patterns which we know to have "I-Unsound" issues.<p>>> The "trusted" version of PL/Rust uses a unique fork of Rust's std entitled postgrestd when compiling LANGUAGE plrust user functions. postgrestd is a specialized Rust compilation target which disallows access to the filesystem and the host operating system.<p>etc.
[1.1.1.1.1] SkiFire13: The approach of patching soundness issues seems pretty dangerous to me, since nothing guarantees there won't be more, or that they even perfectly cover the current ones.
-----
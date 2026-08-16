# 🛡️ Defensive Security & Threat Model: Secure Next Upload

[![Security Researcher: axosolaman](https://img.shields.io/badge/Security%20Researcher-axosolaman-blue.svg)](https://github.com/axosolaman)
[![Research: Axo Security](https://img.shields.io/badge/Research-Axo%20Security-purple.svg)](https://github.com/axosecurity)
[![CWE-434 Mitigated](https://img.shields.io/badge/CWE--434-Immune-brightgreen.svg)]()
[![Bug Bounty Hardened](https://img.shields.io/badge/Bug%20Bounty-Hardened-orange.svg)]()

> **Authored by Security Researcher [axosolaman](https://github.com/axosolaman) ([Axo Security](https://github.com/axosecurity))**  
> *A technical deep-dive into file upload vulnerability mechanics, bug bounty economics, CWE mitigation mappings, defensive cloud storage engineering, and curated learning references.*

---

## 📑 Table of Contents
1. [The Real-World Threat Landscape & Bug Bounty Economics](#1-the-real-world-threat-landscape--bug-bounty-economics)
2. [Master CWE Vulnerability Mitigation Matrix](#2-master-cwe-vulnerability-mitigation-matrix)
3. [The Hidden Dangers of Server-Side EXIF Stripping](#3-the-hidden-dangers-of-server-side-exif-stripping)
4. [5-Layer Defense-in-Depth Pipeline Architecture](#4-5-layer-defense-in-depth-pipeline-architecture)
5. [End-to-End Sequence Diagram](#5-end-to-end-sequence-diagram)
6. [Attacker Exploit Scenarios & How Secure Next Upload Neutralizes Them](#6-attacker-exploit-scenarios--how-secure-next-upload-neutralizes-them)
7. [Vulnerability Learning Resources & Research References](#7-vulnerability-learning-resources--research-references)
8. [Reporting a Vulnerability](#8-reporting-a-vulnerability)
9. [Author & Security Researcher Bio](#9-author--security-researcher-bio)

---

## 1. The Real-World Threat Landscape & Bug Bounty Economics

File upload endpoints are historically the **single most lucrative attack surface** across bug bounty platforms like **HackerOne, Bugcrowd, and Intigriti**. Naive implementations (e.g. standard `multer`, basic presigned URLs without byte inspection, or file-extension-only checks) regularly lead to catastrophic breaches.

### 📊 Public Bug Bounty Data & Industry Stats
* **CWE-434 (Unrestricted Upload of Dangerous Type)**: Over **2,220+ unique disclosed reports** on HackerOne. It remains among the most actively reported critical bug classes.
* **Chained Vulnerabilities**: Path Traversal (CWE-22), Improper Input Validation (CWE-20), and Stored XSS (CWE-79) via uploads account for thousands more findings.
* **Typical Bug Bounty Payout Ranges**:
  * **Basic MIME Spoof / Extension Bypass**: $500 – $3,000
  * **Upload ➔ Stored XSS or EXIF Data Leak**: $1,000 – $5,000
  * **Upload ➔ Path Traversal / Arbitrary File Write**: $3,000 – $15,000
  * **Upload ➔ Remote Code Execution (RCE)**: **$3,000 – $30,000+ (Critical CVSS 9.0–10.0)**

---

## 2. Master CWE Vulnerability Mitigation Matrix

| CWE ID | Vulnerability Name | How Secure Next Upload Neutralizes It | Severity / Impact | Bounty Payout Range |
| :--- | :--- | :--- | :--- | :--- |
| **CWE-434** | **Unrestricted Upload of File with Dangerous Type** | Strict MIME whitelist + max size limits + **16-byte binary magic byte inspection** (PNG, JPEG, PDF, WEBP, AVIF, ZIP, etc.) + post-upload `HeadObject` verification + single-use cryptographic intent tokens. | **Critical → High** (Malware Hosting / Polyglot Bypass) | **$3,000 – $30,000+** |
| **CWE-646** | **Reliance on File Name or Extension of Externally-Supplied File** | Server generates an unpredictable random 7-character object key (e.g. `avatars/xK9_m2Q.webp`). **Never trusts client filenames or double extensions** (`.php.jpg`). Binary magic bytes dictate authenticity. | **High** (Webshell / Polyglot Bypass) | **$2,000 – $10,000** |
| **CWE-20** | **Improper Input Validation** | **5-layer defense-in-depth pipeline**: Client-side validation → Cryptographic presigned URL constraints → Storage metadata verification → S3 Byte-Range binary inspection → Atomic database commit. | **High** (Injection / Tampering) | **$1,000 – $5,000** |
| **CWE-22 / CWE-73** | **Path Traversal / External Control of File Path** | Strict isolated storage folders, randomized server-generated object keys, zero user-controlled file paths, and atomic replacement garbage collection. | **High → Critical** (Arbitrary File Overwrite / Config Tampering) | **$3,000 – $15,000** |
| **CWE-200 / CWE-359 / CWE-212** | **Exposure of Sensitive Information (EXIF / GPS Leakage)** | Client-side **Web Worker automatically strips all EXIF metadata and GPS coordinates** in memory *before* the upload token is even requested. | **Medium → High** (User Doxxing / Privacy Lawsuits / GDPR) | **$1,000 – $5,000** |
| **CWE-400** | **Uncontrolled Resource Consumption (DoS)** | Strict per-entity file size limits + distributed token-bucket rate limiting + **Zero Server Bandwidth (Direct-to-S3/R2 PUT)**. Web servers never buffer file blobs in RAM. | **Medium → High** (Server Crash / Wallet Draining) | **$500 – $3,000** |
| **CWE-862 / CWE-306** | **Missing Authentication / Missing Authorization** | Per-entity `requiresAuth` enforcement, intent records cryptographically bound to authenticated user sessions, and single-use confirmation state machines. | **High** (Unauthorized File Replacement) | **$1,500 – $6,000** |
| **CWE-79** | **Stored XSS via File Upload** | SVGs and HTML payloads are sanitized and rejected unless explicitly permitted in isolated sandboxed entity configurations. | **Medium → High** (Session Hijacking / Account Takeover) | **$1,000 – $5,000** |

---

## 3. The Hidden Dangers of Server-Side EXIF Stripping

Many backend engineers attempt to sanitize image metadata on the server using CLI utilities like `ExifTool`, `ImageMagick`, or native C-bindings. **From an offensive security perspective, server-side EXIF processing introduces severe critical attack vectors:**

### ⚠️ Vulnerabilities Created by Server-Side EXIF Processing

| Risk Type | Description & Real-World Exploits | Severity |
| :--- | :--- | :--- |
| **Command Injection / RCE** | Backend servers invoke binaries (`ExifTool`, `ImageMagick`, `ffmpeg`) on untrusted files. Crafted metadata payloads, filename pipes, or parser format bugs execute arbitrary OS commands. <br>• **CVE-2021-22204** (ExifTool DjVu parser) ➔ Led directly to **CVE-2021-22205 (GitLab unauthenticated pre-auth RCE)**.<br>• Multiple ExifTool command injections via `DateTimeOriginal` and parameter pipe injection. | **Critical (CVSS 9.8–10.0)** |
| **Parser & Memory Corruption** | C/C++ image parsing libraries have a decades-long history of buffer overflows, integer underflows, and out-of-bounds memory writes when unpacking corrupted EXIF chunks. <br>• Real-world vulnerabilities in `libexif`, `ImageMagick`, `OpenImageIO`, and `FFmpeg` metadata decoders. | **High → Critical** |
| **SSRF / Arbitrary File Read** | Legacy image processors parse indirect metadata delegates (e.g. SVG internal XML entities or MSL scripts), forcing the backend server to make internal network requests or dump local `/etc/passwd` files. <br>• Classic **ImageTragick** (CVE-2016-3714) and modern policy-bypass variants. | **High** |
| **Denial of Service (DoS)** | Malformed EXIF headers (such as circular tags or decompression bombs) trigger infinite loops, 100% CPU thread starvation, or multi-gigabyte memory allocations (**CWE-770, CWE-400**). | **Medium → High** |
| **Privacy Leak During Transit** | When EXIF stripping is done on the server, the raw unstripped file (containing high-precision GPS coordinates, user home location, device IDs) is transmitted across the wire and written to temporary server disks or logs before being processed. | **Medium → High (GDPR Breach)** |
| **Incomplete Stripping / Polyglot Survival** | Basic server-side strip commands often strip only standard EXIF IFDs while preserving comments, IPTC, XMP, or embedded PHAR/PHP polyglot blocks inside auxiliary segments. | **Medium → High** |

### 🏆 Why Client-Side Web Worker Stripping Wins

| Architectural Dimension | Client-Side Web Worker (Secure Next Upload) | Traditional Server-Side Processing |
| :--- | :--- | :--- |
| **Server Attack Surface** | **Zero** — Server never executes metadata parsing binaries | **Massive** — Server must execute complex C/Perl binaries |
| **RCE Vulnerability Risk** | **None** — Browser sandbox isolates processing | **High** (History of ExifTool / ImageMagick CVEs) |
| **User GPS & Privacy** | **100% Protected** — Stripped before leaving browser | **Exposed** — Transits wire & lands in server temp storage |
| **Server CPU & Memory Load** | **Zero Overhead** — Client device performs resizing | **High** — Heavy server CPU spikes and RAM consumption |
| **Bypass Resilience** | Bypassing client still triggers server-side magic byte locks | Attacker only needs to craft 1 weaponized metadata exploit |

---

## 4. 5-Layer Defense-in-Depth Pipeline Architecture

```
[ User File ] 
      │
      ▼  Layer 1: Pre-flight Client Validation & Web Worker Processing
   • Resizes image, strips EXIF (GPS/camera metadata), compresses file in Web Worker
   • Checks MIME whitelist and size limits before network transmission
      │
      ▼  Layer 2: Cryptographic Presigned PUT URL Token Issuance
   • Token-bucket rate limiting check (Redis / In-memory)
   • Issues 60s short-lived Presigned PUT URL locked strictly to Content-Type & Length
   • Generates unpredictable random 7-char cache-busting key (folder/aB3_x9Z.ext)
   • Creates database upload intent record with status: "pending"
      │
      ▼  [ Direct Browser-to-Cloud PUT — 0 Server Bandwidth Consumed ]
      │
      ▼  Layer 3: Post-Upload Storage HeadObject Verification
   • Server queries S3 HeadObject metadata to confirm actual byte length & Content-Type
   • Verifies uploaded size matches intent within strict tolerance (fileSizeTolerance: 0.10)
      │
      ▼  Layer 4: 16-Byte Magic Byte Binary Signature Inspection
   • Fetches only first 16 bytes via S3 byte-range request (Range: bytes=0-15)
   • Validates raw mathematical signatures (PNG: 89 50 4E 47, PDF: 25 50 44 46, JPEG: FF D8 FF, etc.)
   • INSTANT PURGE: If spoofed or malicious, instantly deletes object from S3 and marks intent failed
      │
      ▼  Layer 5: Single-Use State Machine & Atomic Replacement
   • Updates intent to "completed" with audit logging
   • If swapMode == "atomic_replace", safely deletes old avatar/document from storage
   • Emits finalized secure public CDN URL
```

---

## 5. End-to-End Sequence Diagram

```mermaid
sequenceDiagram
    autonumber
    participant C as Client (React / Browser)
    participant A as API Server (/api/upload/*)
    participant D as Database (PostgreSQL)
    participant S as Cloud Storage (R2 / S3)
    participant R as Rate Limiter (Redis / In-Memory)

    Note over C: 1. User selects file(s)
    opt Image Entity (compressClientSide: true)
        C->>C: Compress image & Strip EXIF/GPS metadata in Web Worker
    end
    
    Note over C, A: Phase 1: Upload Intent Request
    C->>A: POST /api/upload/request { entityType, fileName, fileSize, mimeType }
    A->>R: Check Token Bucket Rate Limit
    R-->>A: Rate limit OK
    A->>A: Validate entity in UploadRegistry & enforce size/MIME constraints
    A->>D: Insert upload_intents (status: 'pending')
    A->>A: Generate random 7-char objectKey (avatars/aB3_x9Z.webp)
    A->>S: Generate Presigned PUT URL (Locked Content-Type & Length)
    A-->>C: Return presignedUrl, uploadIntentId, objectKey
    
    Note over C, S: Phase 2: Direct Upload (0 Server Bandwidth)
    C->>S: PUT request directly to S3 URL with file binary
    S-->>C: 200 OK (Validated at cloud edge)
    
    Note over C, D: Phase 3: 5-Layer Verification & Atomic Commit
    C->>A: POST /api/upload/confirm { uploadIntentId, previousFileUrl }
    A->>D: Query upload_intent by ID (verify status == 'pending')
    A->>S: HeadObject(objectKey)
    A->>A: Verify size & mime match intent within tolerance
    opt If magicByteCheck enabled
        A->>S: GetObject(objectKey, Range: bytes=0-15)
        A->>A: Deep inspect 16-byte raw Magic Bytes against MIME signature
    end
    alt Validation Failed (Tampered / Spoofed Payload)
        A->>S: DeleteObject(objectKey)
        A->>D: Update intent (status: 'failed')
        A-->>C: 422 Unprocessable Entity (Malicious Payload Rejected)
    else Verification Successful
        opt If swapMode == 'atomic_replace' & previousFileUrl provided
            A->>S: DeleteObject(extractKey(previousFileUrl))
        end
        A->>D: Update upload_intents.status = 'completed'
        A->>D: Insert audit_logs
        A-->>C: 200 OK { fileUrl, objectKey, metadata }
    end
```

---

## 6. Attacker Exploit Scenarios & How Secure Next Upload Neutralizes Them

### Scenario A: The Polyglot Webshell Bypass
* **Attacker Strategy**: Attacker renames `shell.php` to `shell.php.png` or injects PHP code into image comments, expecting the backend or web server to execute it.
* **Secure Next Upload Defense**:
  1. The server generates an unpredictable random key (`avatars/9xK_m2Z.png`), destroying user file paths and extensions.
  2. The raw first 16 bytes are validated against `0x89 0x50 0x4E 0x47` binary signature.
  3. Files are stored on isolated Cloudflare R2 / AWS S3 storage buckets with no PHP execution engine.

### Scenario B: The Extension & MIME Spoof
* **Attacker Strategy**: Attacker intercepts HTTP request and declares `Content-Type: image/jpeg` while sending an `.exe` or `.sh` script.
* **Secure Next Upload Defense**:
  1. The server performs an S3 byte-range read (`Range: bytes=0-15`) on the uploaded object.
  2. Binary signatures for JPEG (`FF D8 FF`) fail verification.
  3. The server immediately issues `DeleteObject` to storage, updates intent status to `failed`, and logs the security incident.

### Scenario C: Intent Replay & Race Conditions
* **Attacker Strategy**: Attacker attempts to reuse a valid `uploadIntentId` to confirm multiple uploads or swap another user's file.
* **Secure Next Upload Defense**:
  1. Intent records are strictly bound to the authenticated `userId`.
  2. The status transition is atomic: only intents with `status == 'pending'` can be confirmed.
  3. Once confirmed, status transitions to `'completed'`. Subsequent requests return `409 Conflict`.

---

## 7. 📚 Vulnerability Learning Resources & Research References

A curated collection of industry-standard security research, interactive labs, and exploit walkthroughs mapped to each vulnerability class:

### 1. Unrestricted File Upload (CWE-434) – Core Vulnerability
* 🧪 **[PortSwigger Web Security Academy: File Upload Vulnerabilities](https://portswigger.net/web-security/file-upload)** — Industry-standard interactive labs and comprehensive exploit walkthroughs.
* 📖 **[OWASP Unrestricted File Upload Guide](https://owasp.org/www-community/vulnerabilities/Unrestricted_File_Upload)** — Foundational vulnerability breakdown and threat impact.
* 📋 **[OWASP File Upload Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/File_Upload_Cheat_Sheet.html)** — Practical architectural checklist for production upload hardening.
* 🛠️ **[The Hacker Recipes: Unrestricted File Upload](https://www.thehacker.recipes/web/inputs/unrestricted-file-upload)** — Concise, attacker-focused payload guide and bypass techniques.
* 📘 **[Techearl: File Upload Vulnerabilities Practitioner Guide](https://techearl.com/file-upload-vulnerabilities)** — Modern technical guide analyzing polyglots and real CVE scenarios.
* 🛡️ **[Offensive360: Insecure File Upload Knowledge Base](https://offensive360.com/knowledge-base/insecure-file-upload/)** — Clear vulnerability-to-remediation analysis.

### 2. Magic Bytes, Content-Type Spoofing & Polyglots
* 🧪 **[PortSwigger: Flawed File Type Validation Labs](https://portswigger.net/web-security/file-upload)** — Practical labs demonstrating magic byte inspection and Content-Type spoofing bypasses.
* 🔍 **[Intigriti: Advanced Insecure File Upload Exploitation Guide](https://www.intigriti.com/researchers/blog/hacking-tools/insecure-file-uploads-a-complete-guide-to-finding-advanced-file-upload-vulnerabilities)** — Deep dive into magic byte spoofing, polyglot construction, and parser edge cases.
* 📜 **[Bug Bounty Playbook: File Operations & Uploads](https://bugbounty.info/Attack-Surface/Web/File-Operations/File-Upload)** — Practical methodology for auditing file upload attack surfaces.
* 📑 **[Wikipedia: List of File Signatures](https://en.wikipedia.org/wiki/List_of_file_signatures)** — Authoritative reference table for file magic bytes and hex headers.

### 3. Reliance on Filename/Extension (CWE-646) & Path Traversal (CWE-22)
* 🧪 **[PortSwigger: Path Traversal via Upload Filenames](https://portswigger.net/web-security/file-upload)** — Labs showing `../` traversal, null-byte injections, and path hijacking in uploads.
* 📖 **[MITRE CWE-646 Official Definition](https://cwe.mitre.org/data/definitions/646.html)** — Formal definition and illustrative examples of filename reliance weaknesses.
* 📖 **[MITRE CWE-22 (Improper Limitation of a Pathname)](https://cwe.mitre.org/data/definitions/22.html)** — Path traversal fundamentals and directory climbing risks.

### 4. Server-Side EXIF & Metadata Processing Risks (RCE via Parsers)
* 💥 **[HackerOne Report #1154542: GitLab ExifTool RCE (CVE-2021-22205)](https://hackerone.com/reports/1154542)** — Original high-profile disclosure by researcher `@vakzz` resulting in critical pre-auth RCE.
* 🔬 **[BlackBerry Threat Research: From Fix to Exploit (CVE-2021-22204 in ExifTool)](https://blogs.blackberry.com/en/2021/06/from-fix-to-exploit-arbitrary-code-execution-for-cve-2021-22204-in-exiftool)** — Detailed reverse-engineering and exploit mechanics of ExifTool DjVu parser execution.
* 📝 **[INE Security: GitLab ExifTool Command Injection Walkthrough](https://ine.com/blog/exiftool-command-injection-cve-2021-22204)** — Step-by-step breakdown of metadata command execution.
* ⚙️ **[Rapid7 Metasploit Module: GitLab ExifTool RCE](https://github.com/rapid7/metasploit-framework/blob/master/modules/exploits/multi/http/gitlab_exif_rce.rb)** — Working exploit chain demonstration for educational lab analysis.

### 5. EXIF & Geolocation Privacy Leakage (CWE-200 / CWE-212 / CWE-359)
* 📖 **[MITRE CWE-200: Exposure of Sensitive Information](https://cwe.mitre.org/data/definitions/200.html)** — Overview of metadata leakage vectors.
* 📖 **[MITRE CWE-212: Improper Removal of Sensitive Information](https://cwe.mitre.org/data/definitions/212.html)** — Weakness classification for failing to strip metadata before public storage.
* 📖 **[MITRE CWE-359: Exposure of Private Personal Information](https://cwe.mitre.org/data/definitions/359.html)** — Privacy compliance implications of GPS coordinate exposure.

### 6. General Web Application Security Testing Guides
* 🎓 **[PortSwigger Learning Path: File Upload Vulnerabilities](https://portswigger.net/web-security/learning-paths/file-upload-vulnerabilities)** — Complete structured curriculum for learning file upload security.
* 🛡️ **[OWASP WSTG: Test Upload of Unexpected File Types](https://owasp.org/www-project-web-security-testing-guide/latest/4-Web_Application_Security_Testing/10-Business_Logic_Testing/08-Test_Upload_of_Unexpected_File_Types)** — Official OWASP penetration testing methodology.
* 🛡️ **[OWASP WSTG: Test Upload of Malicious Files](https://owasp.org/www-project-web-security-testing-guide/latest/4-Web_Application_Security_Testing/10-Business_Logic_Testing/09-Test_Upload_of_Malicious_Files)** — Comprehensive checklist for auditing malicious upload attack paths.

---

## 8. Reporting a Vulnerability

Security is our top priority. If you discover a security vulnerability or potential bypass in `@axosolaman/secure-next-upload`, please report it responsibly:

* **Email**: `security@axosecurity.com` (or reach out directly on GitHub to [@axosolaman](https://github.com/axosolaman))
* Please include proof-of-concept steps, affected component versions, and exploit impact.
* We will acknowledge receipt within 24 hours and provide a coordinated remediation.

---

## 9. Author & Security Researcher Bio

**Secure Next Upload** is architected and maintained by **[axosolaman](https://github.com/axosolaman)** ([Axo Security](https://github.com/axosecurity)).

* **Lead Security Researcher**: **[axosolaman](https://github.com/axosolaman)**
* **GitHub**: [@axosolaman](https://github.com/axosolaman)
* **Organization**: [Axo Security (@axosecurity)](https://github.com/axosecurity)
* **Specialization**: Web Application Security, Bug Bounty Vulnerability Research, Zero-Trust Cloud Architectures, and Defensive AppSec Engineering.

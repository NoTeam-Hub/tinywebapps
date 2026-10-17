# tinywebapps.in: hub plus four tools on one domain (GitHub Pages)

```
/             the hub (index.html)
/clearcut/    Clearcut
/verbatim/    Verbatim
/stillreel/   Stillreel
/tailorly/    The Tailorly
```

Plain static files, no build step. About 211 MB in 196 files; the biggest file is 2 MiB.
`CNAME` holds the domain name and `.nojekyll` tells GitHub to publish the files as they are. Keep both.

## 1. Put the files on GitHub (GitHub Desktop, no command line)
1. Make a free account at github.com, then install **GitHub Desktop** and sign in.
2. **File, New repository.** Name: `tinywebapps`. Local path: any folder (for example Documents). Leave the other boxes as they are and create it.
3. Open that new repository folder on your computer and copy **everything that is inside `tinywebapps-site`** into it (so `index.html`, `clearcut/`, `CNAME` ... sit directly in the repository folder). Make sure the hidden file `.nojekyll` came along (on Windows: View, Show hidden items).
4. Back in GitHub Desktop you will see the files listed. Type a summary such as `First upload`, press **Commit to main**, then **Publish repository**. Untick "Keep this code private" (GitHub Pages on the free plan needs a public repository). Wait for the upload to finish (211 MB).

## 2. Turn on Pages
On github.com open the repository, then **Settings, Pages**. Under **Build and deployment** choose **Deploy from a branch**, branch `main`, folder `/ (root)`, and save. Under **Custom domain** enter `tinywebapps.in` and save (it may already be filled in from the `CNAME` file). The first publish takes a few minutes.

## 3. Point GoDaddy at GitHub
In GoDaddy open the domain, then **DNS**.
* If you changed the nameservers to Cloudflare, set them back first: **Nameservers, Change, GoDaddy Nameservers (default)**.
* Delete the **Parked** A record and any old `www` record.
* Add four **A** records, Name `@`, TTL default: `185.199.108.153`, `185.199.109.153`, `185.199.110.153`, `185.199.111.153`.
* Add one **CNAME** record: Name `www`, Value `YOUR-GITHUB-USERNAME.github.io` (no `https://`, no path).
* Keep GoDaddy's own NS and SOA records as they are.
GitHub's current address list is in its documentation under "Managing a custom domain for your GitHub Pages site". Check these four against it.

## 4. Finish
Back in **Settings, Pages**, wait for "DNS check successful" (minutes to a few hours), then tick **Enforce HTTPS** (the certificate can take up to a day). Then run `python3 check_site.py https://tinywebapps.in` (in the first zip).

## Updating later
Change files in the repository folder, then in GitHub Desktop commit and press **Push origin**. The site updates in a minute or two.

## Notes
* GitHub Pages limits: site up to 1 GB, soft limit of 100 GB traffic a month, no commercial or software-as-a-service sites.
* The old standalone addresses can stay up or be switched off. Visitors' saved settings start fresh on the new domain.
* To change the hub's tool addresses, edit the `TOOLS` block at the top of the script in `index.html`.
